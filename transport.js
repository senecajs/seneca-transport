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


// VERY IMPORTANT
// TODO: listen should use inbound id for actid$


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
  


  // Pending callbacks for all transports.
  var callmap = lrucache( options.callmax )


  seneca.add({role:plugin,cmd:'inflight'}, cmd_inflight)

  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)
  seneca.add({role:plugin,cmd:'client'}, cmd_client)

  seneca.add({role:plugin,hook:'listen',type:'tcp'}, hook_listen_tcp)
  seneca.add({role:plugin,hook:'client',type:'tcp'}, hook_client_tcp)

  seneca.add({role:plugin,hook:'listen',type:'web'}, hook_listen_web)
  seneca.add({role:plugin,hook:'client',type:'web'}, hook_client_web)

  // Legacy api.
  seneca.add({role:plugin,hook:'listen',type:'direct'}, hook_listen_web)
  seneca.add({role:plugin,hook:'client',type:'direct'}, hook_client_web)



  function cmd_inflight( args, done ) {
    var inflight = {}
    callmap.forEach( function(v,k) {
      inflight[k] = v
    })
    done( null, inflight )
  }

  
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
    var seneca         = this
    var type           = args.type
    var listen_options = _.extend({},options[type],args)
    
    var msger = new stream.Duplex({objectMode:true})
    msger._read = function() {}
    msger._write = function( data, enc , done ) {
      var stream_instance = this

      handle_request( seneca, data, listen_options, function(out) {
        stream_instance.push(out)
        return done();
      })
    }

    var listen = net.createServer(function(connection) {
      seneca.log.info('listen', 'connection', listen_options, seneca, 
                      'remote', connection.remoteAddress, connection.remotePort)
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
      seneca.log.error('listen', 'net-error', listen_options, seneca, err.stack||err)
    })

    listen.on('close', function() {
      seneca.log.info('listen', 'close', listen_options, seneca)
      done(null,listen)
    })

    listen.listen( listen_options.port, listen_options.host )
  }


  function hook_client_tcp( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = _.extend({},options[type],args)

    make_client( make_send, client_options, clientdone )


    function make_send( spec, topic ) {
      seneca.log.debug('client', type, 'send-init', 
                       spec, topic, client_options, seneca)

      var msger = new stream.Duplex({objectMode:true})
      msger._read = function() {}
      msger._write = function( data, enc, done ) {
        handle_response( seneca, data, client_options )
        return done();
      }

      var client = net.connect({
        port: client_options.port, 
        host: client_options.host
      })

      client
        .pipe( json_parser_stream )
        .pipe( msger )
        .pipe( json_stringify_stream )
        .pipe( client )

      client.on('error', function(err) {
        seneca.log.error('client', type, 'send-error', 
                         spec, topic, client_options, seneca, err.stack||err)
      })

      client.on('connect', function() {
        seneca.log.debug('client', type, 'send-connect', 
                         spec, topic, client_options, seneca)
      })
      
      return function( args, done ) {
        var outmsg = prepare_request( seneca, args, done )
        msger.push( outmsg )
      }
    }
  }


  var json_parser_stream = new stream.Duplex({objectMode:true})
  json_parser_stream.linebuf = []
  json_parser_stream._read   = function() {}
  json_parser_stream._write  = function(data,enc,done) {
    var str     = ''+data
    var endline = -1
    var remain  = 0

    while( -1 != (endline = str.indexOf('\n',remain)) ) {
      this.linebuf.push( str.substring(remain,endline) )
      var jsonstr = this.linebuf.join('')

      this.linebuf.length = 0
      remain = endline+1

      if( '' == jsonstr ) {
        return done();
      }

      var data = parseJSON( seneca, 'stream', jsonstr )

      if( data ) {
        this.push(data)        
      }
    }

    if( -1 == endline ) {
      this.linebuf.push(str.substring(remain))
    }

    return done();
  }

  var json_stringify_stream = new stream.Duplex({objectMode:true})
  json_stringify_stream._read = function() {}
  json_stringify_stream._write = function( data, enc, done ) {
    var out = stringifyJSON( seneca, 'stream', data )
    
    if( out ) {
      this.push(out+'\n')        
    }

    done()
  }
  

  function hook_listen_web( args, done ) {
    var seneca         = this
    var type           = args.type
    var listen_options = _.extend({},options[type],args)

    var app = connect()
    app.use( connect.timeout( listen_options.timeout ) )
    app.use( connect.responseTime() )

    // query params get injected into args
    // let's you use a GET for debug
    // GETs can have side-effects, this is not a web server, or a REST API
    app.use( connect.query() )

    app.use( function( req, res, next ) {
      var buf = []
      req.setEncoding('utf8')
      req.on('data', function(chunk) { buf.push(chunk) })
      req.on('end', function() {
        try {
          var bufstr = buf.join('')
          req.body = _.extend(
            {},
            0 < bufstr.length ? parseJSON(seneca,'req-body',bufstr) : {},
            req.query||{} )

          next();
        } 
        catch (err) {
          err.body   = err.message+': '+bufstr
          err.status = 400
          next(err)
        }
      })
    })

    
    app.use( function( req, res, next ) {
      if( 0 !== req.url.indexOf(listen_options.path) ) return next();

      var data = {
        id:     req.headers['seneca-id'],
        kind:   'act',
        origin: req.headers['seneca-origin'],
        time: {
          client_sent: req.headers['seneca-time-client-sent'],
        },
        act:   req.body,
      }

      handle_request( seneca, data, listen_options, function(out) {
        var outjson = stringifyJSON(seneca,'listen-web',out.res)

        var headers = {
          'Content-Type':   'application/json',
          'Cache-Control':  'private, max-age=0, no-cache, no-store',
          'Content-Length': buffer.Buffer.byteLength(outjson),
        }
        
        headers['seneca-id']     = out.id
        headers['seneca-kind']   = 'res'
        headers['seneca-origin'] = out.origin
        headers['seneca-accept'] = seneca.id
        headers['seneca-time-client-sent'] = out.time.client_sent
        headers['seneca-time-listen-recv'] = out.time.listen_recv
        headers['seneca-time-listen-sent'] = out.time.listen_sent
        
        res.writeHead( 200, headers )
        res.end( outjson )
      })
    })

    seneca.log.info('listen', listen_options, seneca)
    var listen = app.listen( listen_options.port, listen_options.host )

    done(null,listen)
  }


  function hook_client_web( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = _.extend({},options[type],args)

    make_client( make_send, client_options, clientdone )

    function make_send( spec, topic ) {
      var fullurl = 
            'http://'+client_options.host+':'+
            client_options.port+client_options.path

      seneca.log.debug('client', 'web', 'send', spec, topic, client_options, 
                       fullurl, seneca)
      
      return function( args, done ) {
        var data = prepare_request( this, args, done )

        var headers = {
          'seneca-id':               data.id, 
          'seneca-kind':             'req', 
          'seneca-origin':           seneca.id, 
          'seneca-time-client-sent': data.time.client_sent
        }

        var reqopts = {
          url:     fullurl,
          json:    args,
          headers: headers,
        }

        request.post( reqopts, function(err,response,body) {

          var data = {
            id:     response.headers['seneca-id'],
            kind:   'res',
            origin: response.headers['seneca-origin'],
            accept: response.headers['seneca-accept'],
            time: {
              client_sent: response.headers['seneca-time-client-sent'],
              listen_recv: response.headers['seneca-time-listen-recv'],
              listen_sent: response.headers['seneca-time-listen-sent'],
            },
            res:   body,
            error: err
          }

          handle_response( seneca, data, client_options )
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
      _.each( raw, function(v,k) {
        if( _.isObject(v) && v.entity$ ) {
          raw[k] = seneca.make$( v )
        }
      })
      return raw
    }
  }


  function resolve_pins( opts ) {
    var pins = opts.pin || opts.pins
    if( pins ) {
      pins = _.isArray(pins) ? pins : [pins]
    }
    return pins
  }


  // can handle glob expressions :)
  function make_argspatrun( pins ) {
    var argspatrun = patrun(function(pat,data) {
      var gexers = {}
      _.each(pat, function(v,k) {
        if( _.isString(v) && ~v.indexOf('*') ) {
          delete pat[k]
          gexers[k] = gex(v)
        }
      })

      // handle previous patterns that match this pattern
      var prev = this.list(pat)
      var prevfind = prev[0] && prev[0].find
      var prevdata = prev[0] && this.findexact(prev[0].match)

      return function(args,data) {
        var out = data
        _.each(gexers,function(g,k) {
          var v = null==args[k]?'':args[k]
          if( null == g.on( v ) ) { out = null }
        })

        if( prevfind && null == out ) {
          out = prevfind.call(this,args,prevdata)
        }

        return out
      }
    })

    _.each( pins, function( pin ) {
      var spec = { pin:pin }
      argspatrun.add(pin,spec)
    })

    return argspatrun
  }


  function resolvetopic( spec, args ) {
    if( !spec.pin ) return function() { return 'any' }

    var topicpin = _.clone(spec.pin)

    var topicargs = {}
    _.each(topicpin, function(v,k) { topicargs[k]=args[k] })

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
        send.call(this,args,done)
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
        send.call(this,args,done)
      }
    }
  }


  function prepare_response( seneca, input ) {
    return {
      id:     input.id,
      kind:   'res',
      origin: input.origin,
      accept: seneca.id,
      time: { 
        client_sent:(input.time&&input.time.client_sent), 
        listen_recv:Date.now() 
      },
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
      do_topic( msgprefix+'any' )
    }
  }


  function handle_response( seneca, data, client_options ) {
    data.time = data.time || {}
    data.time.client_recv = Date.now()

    if( 'res' != data.kind ) {
      return seneca.log.error('client', 'invalid-kind', client_options, 
                       seneca, data)
    }

    if( null == data.id ) {
      return seneca.log.error('client', 'no-message-id', client_options, 
                              seneca, data);
    }

    var callmeta = callmap.get(data.id)

    if( callmeta ) {
      callmap.del( data.id )
    }
    else {
      return seneca.log.error('client', 'unknown-message-id', client_options, 
                              seneca, data);
    }

    var err = null
    if( data.error ) {
      err = new Error( data.error.message )
      err.details = data.error.details
      err.raw     = data.error
    }
    
    var result = handle_entity(data.res)

    try {
      callmeta.done( err, result ) 
    }
    catch(e) {
      seneca.log.error('client', 'callback-error', client_options, 
                       seneca, data, e.stack||e)
    }
  }


  function prepare_request( seneca, args, done ) {
    var callmeta = {
      args: args,
      done: _.bind(done,seneca),
      when: Date.now()
    }
    callmap.set(args.actid$,callmeta) 

    var output = {
      id:     args.actid$,
      kind:   'act',
      origin: seneca.id,
      time:   { client_sent:Date.now() },
      act:    args,
    }

    return output;
  }


  function handle_request( seneca, data, listen_options, respond ) {
    if( null == data ) return;

    if( 'act' != data.kind ) {
      seneca.log.error('listen', 'invalid-kind', listen_options, 
                       seneca, data)
      return;
    }

    if( null == data.id ) {
      seneca.log.error('listen', 'no-message-id', listen_options, 
                       seneca, data)
      return;
    }

    if( data.error ) {
      seneca.log.error('listen', 'data-error', listen_options, 
                       seneca, data )
      return;
    }

    var output = prepare_response( seneca, data )
    var input  = handle_entity( data.act )

    try {
      seneca.act( input, function( err, out ) {
        update_output(output,err,out)
          
        respond(output)
      })
    }
    catch(e) {
      catch_act_error( seneca, e, listen_options, data, output )
      respond(output)
    }
  }


  function make_client( make_send, client_options, clientdone ) {
    var client = make_anyclient( make_send( {}, 'any' ) )

    var pins = resolve_pins( client_options )
    if( pins ) {
      var argspatrun  = make_argspatrun( pins )
      var resolvesend = make_resolvesend( {}, make_send )

      client = make_pinclient( resolvesend, argspatrun )
    }

    seneca.log.info( 'client', client_options, pins||'any', seneca )
    clientdone( null, client )
  }


  function parseJSON( seneca, note, str ) {
    if( str ) {
      try {
        return JSON.parse( str )
      }
      catch( e ) {
        seneca.log.error( 'json-parse', note, str )
      }
    }
  }


  function stringifyJSON( seneca, note, obj ) {
    if( obj ) {
      try {
        return JSON.stringify( obj )
      }
      catch( e ) {
        seneca.log.error( 'json-stringify', note, obj )
      }
    }
  }


  var transutils = {

    // listen
    handle_request:   handle_request,
    prepare_response: prepare_response,

    // client
    prepare_request:  prepare_request,
    handle_response:  handle_response,

    // utility
    handle_entity:    handle_entity,
    update_output:    update_output,
    catch_act_error:  catch_act_error,
    listen_topics:    listen_topics,
    make_anyclient:   make_anyclient,
    resolve_pins:     resolve_pins,
    make_argspatrun:  make_argspatrun,
    make_resolvesend: make_resolvesend,
    make_pinclient:   make_pinclient,
    make_client:      make_client,
    parseJSON:        parseJSON,
    stringifyJSON:    stringifyJSON,
  }


  return {
    name:      plugin,
    exportmap: { utils: transutils },
    options:   options
  }
}
