/* Copyright (c) 2013-2014 Richard Rodger, MIT License */
"use strict";


var buffer = require('buffer')
var util   = require('util')
var net    = require('net')
var stream = require('stream')


var _           = require('underscore')
var patrun      = require('patrun')
var gex         = require('gex')
var connect     = require('connect')
var request     = require('request')
var lrucache    = require('lru-cache')




module.exports = function( options ) {
  var seneca = this
  var plugin = 'transport'

  var so = seneca.options()


  options = seneca.util.deepextend({
    msgprefix: 'seneca_',
    callmax:   1111,
    msgidlen:  12,

    tcp: {
      type:     'tcp',
      host:     'localhost',
      port:     10101,
      timeout:  so.timeout ? so.timeout-555 :  22222,
    },

    web: {
      type:     'web',
      port:     10201,
      host:     'localhost',
      path:     '/act',
      protocol: 'http',
      timeout:  so.timeout ? so.timeout-555 :  22222,
    },

  },options)
  

  var callmap   = lrucache( options.callmax )



  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)
  seneca.add({role:plugin,cmd:'client'}, cmd_client)

  seneca.add({role:plugin,hook:'listen',type:'tcp'}, hook_listen_tcp)
  seneca.add({role:plugin,hook:'client',type:'tcp'}, hook_client_tcp)

  seneca.add({role:plugin,hook:'listen',type:'web'}, hook_listen_web)
  seneca.add({role:plugin,hook:'client',type:'web'}, hook_client_web)



  
  function cmd_listen( args, done ) {
    var seneca = this

    var listen_config = parseConfig(args)
    var listen_args   = _.omit(_.extend({},listen_config,
                                        {role:plugin,hook:'listen'}),'cmd') 

    seneca.act( listen_args, done )
  }



  function cmd_client( args, done ) {
    var seneca = this

    var client_config = parseConfig(args)
    var client_args   = _.omit(_.extend({},client_config,
                                        {role:plugin,hook:'client'}),'cmd')

    seneca.act( client_args, done )
  }



  function hook_listen_tcp( args, done ) {
    var seneca = this
    var listen_options = _.extend({},options[args.type],args)
    

    var msger = new stream.Duplex({objectMode:true})
    msger._read = function(){}
    msger._write = function(data,end,done) {
      var stream_instance = this
      //console.log('LISTEN IN',data)

      if( null == data.id ) {
        seneca.log.error('listen', 'invalid-error', listen_options, seneca, 'no-message-id')
        return done();
      }

      if( data.error ) {
        seneca.log.error('listen', 'in-error', listen_options, seneca, data.error, data.error.stack)
        return done();
      }

      if( 'act' == data.kind ) {
        var output = prepare_response( seneca, data )

        try {
          var input = handle_entity( data.act )
          seneca.act( input, function( err, out ){
            update_output(output,err,out)

            //console.log('LISTEN OUT',output)
            stream_instance.push(output)        
          })
          return done();
        }
        catch(e) {
          catch_act_error( seneca, e, listen_options, data, output )

          stream_instance.push(output)        
          return done();
        }
      }
      else {
        seneca.log.error('listen', 'kind-error', listen_options, seneca, 'not-act', data)
        done();
      }
    }


    var listen = net.createServer(function(connection) {
      seneca.log.info('listen', 'connection', listen_options, seneca, 'remote', connection.remoteAddress, connection.remotePort)
      connection
        .pipe(json_parser_stream)
        .pipe(msger)
        .pipe(json_stringify_stream)
        .pipe(connection)
    })

    listen.on('listening', function() {
      seneca.log.info('listen', 'open', listen_options, seneca)
      done(null,listen)
    })

    listen.on('error', function(err) {
      seneca.log.error('listen', 'net-error', listen_options, seneca, err, err.stack)
    })

    listen.on('close', function() {
      seneca.log.info('listen', 'close', listen_options, seneca)
      done(null,listen)
    })

    listen.listen( listen_options.port, listen_options.host )
  }



  function hook_client_tcp( args, clientdone ) {
    var seneca = this
    var client_options = _.extend({},options[args.type],args)


    var client = make_anyclient(make_send({},'any'))


    var pins = resolve_pins(args)
    if( pins ) {
      var argspatrun  = make_argspatrun(pins)
      var resolvesend = make_resolvesend({},make_send)

      client = make_pinclient( resolvesend, argspatrun )
    }

    seneca.log.info('client', client_options.type, client_options.host, client_options.port, pins||'any', seneca)
    clientdone(null,client)



    function make_send( spec, topic ) {
      var callmap = lrucache( client_options.callmax )

      var msger = new stream.Duplex({objectMode:true})
      msger._read = function(){}
      msger._write = function(data,enc,done) {
        data = handle_response( seneca, data, client_options )
        if( !data ) return done();

        // TODO: no, pass this on to callback
        if( data.error ) {
          seneca.log.error('client', 'in-error', client_options.type, client_options.host, client_options.port, seneca, data, data.error.stack)
          return done();
        }

        if( 'res' == data.kind ) {
          try {

            var callmeta = callmap.get(data.id)
            if( callmeta ) {
              callmeta.done( data.error ? data.error : null, handle_entity(data.res) )
            }
          }
          catch(e) {
            seneca.log.error('client', 'res-error', client_options.type, client_options.host, client_options.port, seneca, data, e, e.stack)
          }
        }
        else {
          seneca.log.error('client', 'kind-error', client_options.type, client_options.host, client_options.port, seneca, 'not-res', data)
        }

        done()
      }


      var client = net.connect({port: client_options.port, host:client_options.host})

      client
        .pipe( json_parser_stream )
        .pipe( msger )
        .pipe( json_stringify_stream )
        .pipe( client )

      client.on('error', function(err){
        seneca.log.error('client', client_options.type, 'send', spec, topic, client_options.host, client_options.port, seneca, err, err.stack)
      })

      client.on('connect', function(){
        seneca.log.debug('client', client_options.type, 'send', spec, topic, client_options.host, client_options.port, seneca)
      })

      
      return function( args, done ) {
        /*
        var outmsg = {
          id:     args.actid$,
          kind:   'act',
          origin: seneca.id,
          time:   { client_sent:Date.now() },
          act:    args,
        }
         */

        var outmsg = prepare_request( seneca, args )

        var callmeta = {
          done: _.bind(done,this)
        }

        callmap.set(outmsg.id,callmeta) 

        //console.log('CLIENT SEND',outmsg)
        msger.push( outmsg )
      }

    }
  }  


  var json_parser_stream = new stream.Duplex({objectMode:true})
  json_parser_stream.linebuf = []
  json_parser_stream._read = function(){}
  json_parser_stream._write = function(data,enc,done) {
    var str = ''+data
    //console.log( 'P[< '+str+' >]' )


    var endline = -1
    var remain  = 0
    while( -1 != (endline = str.indexOf('\n',remain)) ) {
      this.linebuf.push( str.substring(remain,endline) )
      var jsonstr = this.linebuf.join('')
      //console.log( 'PJ[< '+jsonstr+' >]' )

      this.linebuf.length = 0
      remain = endline+1


      if( '' == jsonstr ) {
        return done();
      }

      try {
        var out = JSON.parse(jsonstr)
      }

      // TODO: log this
      catch(e) {
        out = {
          error:  e,
          data:   data,
          when: Date.now()
        }
      }
    
      this.push(out)        
    }

    if( -1 == endline ) {
      this.linebuf.push(str.substring(remain))
    }

    return done();
  }



  var json_stringify_stream = new stream.Duplex({objectMode:true})
  json_stringify_stream._read = function(){}
  json_stringify_stream._write = function(data,enc,done) {
    try {
      var out = JSON.stringify(data)+'\n'
    }
    catch(e) {
      out = JSON.stringify({
        error:  e,
        data:   data,
        when: Date.now()
      })
    }
    
    this.push(out)        
    done()
  }
  







  function hook_listen_web( args, done ) {
    var seneca = this
    var listen_options = _.extend({},options[args.type],args)

    //console.log('listen',args)
    

    var app = connect()
    //app.use( connect.limit( listen_options.limit ) )
    app.use( connect.timeout( listen_options.timeout ) )
    app.use( connect.responseTime() )

    // query params get injected into args
    // let's you use a GET for debug
    // GETs can have side-effects, this is not a web server, or a REST API
    app.use( connect.query() )


    app.use( function( req, res, next ){
      var buf = []
      req.setEncoding('utf8')
      req.on('data', function(chunk){ buf.push(chunk) })
      req.on('end', function(){
        try {
          var bufstr = buf.join('')
          req.body = _.extend(0<bufstr.length?JSON.parse(bufstr):{},req.query||{})

          next();
        } 
        catch (err){
          err.body   = err.message+': '+bufstr
          err.status = 400
          next(err)
        }
      })
    })

    
    function handle_error(args,e,req,res) {
      seneca.log.error('listen',e)

      if( e.seneca ) {
        e.seneca.message = e.message
        sendjson( args, req, res, e.seneca )
      } 
      else {
        res.writeHead(500)
        res.end( e.message )
      }
    }


    app.use( function( req, res, next ){
      if( 0 !== req.url.indexOf(listen_options.path) ) return next();

      var recv_time = Date.now()
      try {
        var input = handle_entity( req.body )
        seneca.act( input, function( err, out ){
          if( err ) return handle_error(input,err,req,res,recv_time);
          sendjson( input, req, res, out, recv_time )
        })
      }
      catch(e) {
        handle_error(req.body,err,req,res,recv_time);
      }
    })


    seneca.log.info('listen', listen_options, seneca)
    var listen = app.listen( listen_options.port, listen_options.host )

    done(null,listen)
  }



  function sendjson( args, req, res, obj, recv_time ) {
    var outjson = _.isUndefined(obj) ? '{}' : JSON.stringify(obj)

    var headers = {
      'Content-Type':   'application/json',
      'Cache-Control':  'private, max-age=0, no-cache, no-store',
      'Content-Length': buffer.Buffer.byteLength(outjson),
    }

    if( args ) {
      headers['Seneca-id']     = args.actid$
      headers['Seneca-kind']   = 'res'
      headers['Seneca-origin'] = req.headers['seneca-origin']
      headers['Seneca-accept'] = seneca.id
      headers['Seneca-time-client-sent'] = req.headers['seneca-time-client-sent']
      headers['Seneca-time-listen-recv'] = recv_time
      headers['Seneca-time-listen-sent'] = Date.now()
    }


    //console.log('listen json',args,headers)

    res.writeHead( 200, headers )
    res.end( outjson )
  }




  function hook_client_web( args, clientdone ) {
    var seneca = this
    var client_options = _.extend({},options[args.type],args)


    //console.log('client',args)

    var fullurl = 'http://'+client_options.host+':'+client_options.port+client_options.path

    var client = make_anyclient(make_send({},'any'))


    var pins = resolve_pins(args)
    if( pins ) {
      var argspatrun  = make_argspatrun(pins)
      var resolvesend = make_resolvesend({},make_send)

      client = make_pinclient( resolvesend, argspatrun )
    }

    seneca.log.info('client', 'web', client_options, fullurl, pins||'any', seneca)
    clientdone(null,client)



    function make_send( spec, topic ) {
      seneca.log.debug('client', 'web', 'send', spec, topic, client_options, fullurl, seneca)
      
      return function( args, done ) {

        var headers = {
          'Seneca-id': args.actid$, 
          'Seneca-kind': 'req', 
          'Seneca-origin': seneca.id, 
          'Seneca-time-client-sent': Date.now()
        }

        //console.log('client json',args,headers)

        var reqopts = {
          url:  fullurl,
          json: args,
          headers: headers,
        }

        request.post( reqopts, function(err,response) {
          // TODO: need more info for this err
          if(err) return done(err);

          var recv_time = Date.now()
          if( 200 != response.statusCode ) {
            var errdesc = response.body

            var localerr = new Error(errdesc.message)
            localerr.details = response.headers
            localerr.details['Seneca-client-recv-time'] = recv_time

            localerr.seneca = errdesc
            done(localerr)
          }
          else {
            var out = handle_entity( response.body )
            done(null, out)
          }
        })
      }
    }
  }  



  function parseConfig( args ) {
    //console.log('pc',args)
    var out = {}

    var config = args.config || args

    if( _.isArray( config ) ) {
      var arglen = config.length

      if( 0 === arglen ) {
        out.port = base.port
        out.host = base.host
        out.path = base.path
      }
      else if( 1 === arglen ) {
        if( _.isObject( config[0] ) ) {
          out = config[0]
        }
        else {
          out.port = parseInt(config[0])
          out.host = base.host
          out.path = base.path
        }
      }
      else if( 2 === arglen ) {
        out.port = parseInt(config[0])
        out.host = config[1]
        out.path = base.path
      }
      else if( 3 === arglen ) {
        out.port = parseInt(config[0])
        out.host = config[1]
        out.path = config[2]
      }

    }
    else out = config;

    // Default transport is tcp
    out.type = out.type || 'tcp'

    //out.type = null == out.type ? base.type : out.type

    if( 'direct' == out.type ) {
      out.type = 'tcp'
    }


    var base = options[out.type] || {}
    //console.log('base',base)

    out = _.extend({},base,out)

    if( 'web' == out.type || 'tcp' == out.type ) {
      out.port = null == out.port ? base.port : out.port 
      out.host = null == out.host ? base.host : out.host
      out.path = null == out.path ? base.path : out.path
    }

    return out
  }


  // only support first level
  // interim measure - deal with this in core seneca act api
  // allow user to specify operations on result
  function handle_entity( raw ) {
    raw = _.isObject( raw ) ? raw : {}
    
    if( raw.entity$ ) {
      return seneca.make$( raw )
    }
    else {
      _.each( raw, function(v,k){
        if( _.isObject(v) && v.entity$ ) {
          raw[k] = seneca.make$( v )
        }
      })
      return raw
    }
  }



  function resolve_pins( args ) {
    var pins = args.pin || args.pins
    if( pins ) {
      pins = _.isArray(pins) ? pins : [pins]
    }
    return pins
  }



  // can handle glob expressions :)
  function make_argspatrun( pins ) {
    var argspatrun = patrun(function(pat,data){
      var gexers = {}
      _.each(pat, function(v,k){
        if( _.isString(v) && ~v.indexOf('*') ) {
          delete pat[k]
          gexers[k] = gex(v)
        }
      })

      // handle previous patterns that match this pattern
      var prev = this.list(pat)
      var prevfind = prev[0] && prev[0].find
      var prevdata = prev[0] && this.findexact(prev[0].match)

      return function(args,data){
        var out = data
        _.each(gexers,function(g,k){
          var v = null==args[k]?'':args[k]
          if( null == g.on( v ) ) { out = null }
        })

        if( prevfind && null == out ) {
          out = prevfind.call(this,args,prevdata)
        }

        return out
      }
    })

    _.each( pins, function( pin ){
      var spec = { pin:pin }
      argspatrun.add(pin,spec)
    })

    return argspatrun
  }



  function resolvetopic( spec, args ) {
    if( !spec.pin ) return function() { return 'any' }

    var topicpin = _.clone(spec.pin)

    var topicargs = {}
    _.each(topicpin, function(v,k){ topicargs[k]=args[k] })

    return util.inspect(topicargs)
      .replace(/[^\w\d]/g,'_')
  }


  function make_resolvesend( sendmap, make_send ) {
    return function( spec, args ) {
      var topic = resolvetopic(spec,args)
      var send = sendmap[topic]
      if( send ) return send;

      return sendmap[topic] = make_send(spec,topic)
    }
  }



  function make_anyclient( send ) {
    return {
      match: function( args ) { 
        return !this.has(args)
      },
      send: function( args, done ) {
        send(args,done)
      },
    }
  }


  function make_pinclient( resolvesend, argspatrun ) {  
    return {
      match: function( args ) {
        var match = !!argspatrun.find(args)
        return match
      },
      send: function( args, done ) {
        var spec = argspatrun.find(args)
        var send = resolvesend(spec,args)
        send(args,done)
      }
    }
  }



  function prepare_response( seneca, input ) {
    return {
      id:     input.id,
      kind:   'res',
      origin: input.origin,
      accept: seneca.id,
      time:   { client_sent:(input.time&&input.time.client_sent), listen_recv:Date.now() },
    }
  }


  function update_output( output, err, out ) {
    output.res = out

    if( err ) {
      output.error  = err
      output.input = data
    }

    output.time.listen_sent = Date.now()
  }


  function catch_act_error( seneca, e, listen_options, input, output ) {
    seneca.log.error('listen', 'act-error', listen_options, e.stack || e )
    output.error = e
    output.input = input
  }


  function listen_topics( seneca, args, listen_options, do_topic ) {
    var msgprefix = options.msgprefix
    var pins      = resolve_pins( args )

    if( pins ) {
      _.each( seneca.findpins( pins ), function(pin) {
        var topic = msgprefix + util.inspect(pin).replace(/[^\w\d]/g,'_')
        do_topic( topic )
      })
    }
    else {
      do_topic(msgprefix+'any')
    }
  }


  function handle_response( seneca, input, client_options ) {
    input.time = input.time || {}
    input.time.client_recv = Date.now()

    if( null == input.id ) {
      seneca.log.error('client', 'invalid-error', client_options, seneca, 
                       'no-message-id', input)
      return null
    }

    return input;
  }


  function prepare_request( seneca, args ) {
    var output = {
      id:     args.actid$,
      kind:   'act',
      origin: seneca.id,
      time:   { client_sent:Date.now() },
      act:    args,
    }

    return output;
  }


  var transutils = {
    handle_entity:    handle_entity,
    prepare_response: prepare_response,
    update_output:    update_output,
    catch_act_error:  catch_act_error,
    listen_topics:    listen_topics,
    handle_response:  handle_response,
    prepare_request:  prepare_request,
    make_anyclient:   make_anyclient,
    resolve_pins:     resolve_pins,
    make_argspatrun:  make_argspatrun,
    make_resolvesend: make_resolvesend,
    make_pinclient:   make_pinclient,
  }


  return {
    name: plugin,
    exportmap: { utils: transutils },
    options: options
  }
}
