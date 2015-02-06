/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
"use strict";


var buffer = require('buffer')
var util   = require('util')
var net    = require('net')
var stream = require('stream')


var _           = require('lodash')
var patrun      = require('patrun')
var gex         = require('gex')
var jsonic      = require('jsonic')
var connect     = require('connect')
var needle      = require('needle')
var lrucache    = require('lru-cache')
var reconnect   = require('reconnect-net')
var nid         = require('nid')
var timeout     = require('connect-timeout');
var query       = require('connect-query');


module.exports = function transport( options ) {
  /* jshint validthis:true */

  var seneca = this
  var plugin = 'transport'

  var so = seneca.options()


  options = seneca.util.deepextend({
    msgprefix: 'seneca_',
    callmax:   111111,
    msgidlen:  12,

    warn: {
      unknown_message_id: true,
      invalid_kind:       true,
      no_message_id:      true,      
      message_loop:       true,      
      own_message:        true,
    },

    check: {
      message_loop: true,
      own_message: true
    },

    web: {
      type:     'web',
      port:     10101,
      host:     '0.0.0.0',
      path:     '/act',
      protocol: 'http',
      timeout:  Math.max( so.timeout ? so.timeout-555 : 5555, 555 )
    },

    tcp: {
      type:     'tcp',
      host:     '0.0.0.0',
      port:     10201,
      timeout:  Math.max( so.timeout ? so.timeout-555 : 5555, 555 )
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

  // Aliases.
  seneca.add({role:plugin,hook:'listen',type:'http'}, hook_listen_web)
  seneca.add({role:plugin,hook:'client',type:'http'}, hook_client_web)

  // Legacy API.
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

    var listen_config = args.config // parseConfig(args)
    var listen_args  = 
          seneca.util.clean(
            _.omit(
              _.extend({},listen_config,{role:plugin,hook:'listen'}),'cmd'))

    if( handle_legacy_types(listen_args.type,done) ) {
      seneca.act( listen_args, done )
    }
  }



  function cmd_client( args, done ) {
    var seneca = this

    var client_config = args.config // parseConfig(args)
    var client_args   = 
          seneca.util.clean(
            _.omit(
              _.extend({},client_config,{role:plugin,hook:'client'}),'cmd'))


    if( handle_legacy_types(client_args.type,done) ) {
      seneca.act( client_args, done )
    }
  }



  function handle_legacy_types(type,done) {
    var ok = false

    if( 'pubsub' == type ) {
      done(seneca.fail('plugin-needed',{name:'seneca-redis-transport'}))
    }
    else if( 'queue' == type ) {
      done(seneca.fail('plugin-needed',{name:'seneca-beanstalkd-transport'}))
    }
    else ok = true;

    return ok;
  }



  function hook_listen_tcp( args, done ) {
    var seneca         = this
    var type           = args.type
    var listen_options = seneca.util.clean(_.extend({},options[type],args))
    
    function make_msger() {
      var msger = new stream.Duplex({objectMode:true})
      msger._read = function() {}
      msger._write = function( data, enc , done ) {
        var stream_instance = this

        handle_request( seneca, data, listen_options, function(out) {
          if( null == out ) return done();
          stream_instance.push(out)
          return done();
        })
      }
      return msger
    }

    var connections = []

    var listen = net.createServer(function(connection) {
      seneca.log.info('listen', 'connection', listen_options,
                      'remote', connection.remoteAddress, connection.remotePort)
      connection
        .pipe(json_parser_stream())
        .pipe(make_msger())
        .pipe(json_stringify_stream())
        .pipe(connection)

      connection.on('error',function(err){
        seneca.log.error('listen', 'pipe-error', listen_options, err.stack||err)
      })

      connections.push(connection)
    })

    listen.on('listening', function() {
      seneca.log.info('listen', 'open', 
                      listen_options)
      done()
    })

    listen.on('error', function(err) {
      seneca.log.error('listen', 'net-error', listen_options, err.stack||err)
    })

    listen.on('close', function() {
      seneca.log.info('listen', 'close', listen_options)
    })

    listen.listen( listen_options.port, listen_options.host )


    seneca.add('role:seneca,cmd:close',function( close_args, done ) {
      var closer = this

      listen.close()
      connections.forEach(function(con){
        try { con.destroy() } catch(e) { seneca.log.error(e) }
      })

      closer.prior(close_args,done)
    })
  }



  function hook_client_tcp( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = seneca.util.clean(_.extend({},options[type],args))

    make_client( seneca, make_send, client_options, clientdone )


    function make_send( spec, topic, send_done ) {
      seneca.log.debug('client', type, 'send-init', 
                       spec, topic, client_options)

      function make_msger() {
        var msger = new stream.Duplex({objectMode:true})
        msger._read = function() {}
        msger._write = function( data, enc, done ) {
          handle_response( seneca, data, client_options )
          return done();
        }
        return msger;
      }

      var msger = make_msger()
      var connections = []

      var clientconnect = reconnect( function(client) {
        connections.push(client)

        client
          .pipe( json_parser_stream() )
          .pipe( msger )
          .pipe( json_stringify_stream() )
          .pipe( client )

      }).on('connect', function() {
          seneca.log.debug('client', type, 'connect', 
                           spec, topic, client_options)

      }).on('reconnect', function() {
          seneca.log.debug('client', type, 'reconnect', 
                           spec, topic, client_options)

      }).on('disconnect', function(err) {
          seneca.log.debug('client', type, 'disconnect', 
                           spec, topic, client_options,
                           (err&&err.stack)||err)

      }).connect({
        port: client_options.port, 
        host: client_options.host
      })

      send_done( null, function( args, done ) {
        var outmsg = prepare_request( this, args, done )
        msger.push( outmsg )
      })

      seneca.add('role:seneca,cmd:close',function( close_args, done ) {
        var closer = this

        clientconnect.disconnect()
        connections.forEach(function(con){
          try { con.destroy() } catch(e) { seneca.log.error(e) }
        })

        closer.prior(close_args,done)
      })
    }
  }



  function json_parser_stream() {
    var json_parser = new stream.Duplex({objectMode:true})
    json_parser.linebuf = []
    json_parser._read   = function() {}
    json_parser._write  = function(data,enc,done) {
      var str     = ''+data
      var endline = -1
      var remain  = 0

      while( -1 != (endline = str.indexOf('\n',remain)) ) {
        this.linebuf.push( str.substring(remain,endline) )
        var jsonstr = this.linebuf.join('')

        this.linebuf.length = 0
        remain = endline+1

        if( '' === jsonstr ) {
          return done();
        }

        var outdata = parseJSON( seneca, 'stream', jsonstr )

        if( outdata ) {
          this.push(outdata)        
        }
      }

      if( -1 == endline ) {
        this.linebuf.push(str.substring(remain))
      }

      return done();
    }

    return json_parser;
  }



  function json_stringify_stream() {
    var json_stringify = new stream.Duplex({objectMode:true})
    json_stringify._read = function() {}
    json_stringify._write = function( data, enc, done ) {
      var out = stringifyJSON( seneca, 'stream', data )
    
      if( out ) {
        this.push(out+'\n')        
      }

      done()
    }

    return json_stringify;
  }
  


  function hook_listen_web( args, done ) {
    var seneca         = this
    var type           = args.type
    var listen_options = seneca.util.clean(_.extend({},options[type],args))

    var app = connect()
    app.use( timeout( listen_options.timeout ) )

    // query params get injected into args
    // let's you use a GET for debug
    // GETs can have side-effects, this is not a web server, or a REST API
    app.use( query() )

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
        catch(err) {
          err.body   = err.message+': '+bufstr
          err.status = 400
          next(err)
        }
      })
    })

    app.use( function( req, res, next ) {
      if( 0 !== req.url.indexOf(listen_options.path) ) return next();

      var data
      var standard = !!req.headers['seneca-id']

      if( standard ) {
        data = {
          id:     req.headers['seneca-id'],
          kind:   'act',
          origin: req.headers['seneca-origin'],
          track:  parseJSON(
            seneca,'track-receive',req.headers['seneca-track']) || [],
          time: {
            client_sent: req.headers['seneca-time-client-sent'],
          },
          act:    req.body,
        }
      }

      // convenience for non-seneca clients
      else {
        data = {
          id:     seneca.idgen(),
          kind:   'act',
          origin: req.headers['user-agent'] || 'UNKNOWN',
          track:  [],
          time: {
            client_sent: Date.now()
          },
          act:    req.body,
        }
      }

      handle_request( seneca, data, listen_options, function(out) {
        var outjson  = "{}"
        var iserror  = false
        var httpcode = 200

        if( null != out ) {
          if( out.res ) {
            outjson = stringifyJSON(seneca,'listen-web',out.res)
          }
          else if( out.error ) {
            iserror = true
            outjson = stringifyJSON(seneca,'listen-web',out.error)
          }
        }

        var headers = {
          'Content-Type':   'application/json',
          'Cache-Control':  'private, max-age=0, no-cache, no-store',
          'Content-Length': buffer.Buffer.byteLength(outjson),
        }
        
        headers['seneca-id']     = out ? out.id : seneca.if
        headers['seneca-kind']   = 'res'
        headers['seneca-origin'] = out ? out.origin : 'UNKNOWN'
        headers['seneca-accept'] = seneca.id
        headers['seneca-track']  = ''+(data.track ? data.track : [])
        headers['seneca-time-client-sent'] = out ? out.time.client_sent : '0'
        headers['seneca-time-listen-recv'] = out ? out.time.listen_recv : '0'
        headers['seneca-time-listen-sent'] = out ? out.time.listen_sent : '0'
        
        if( iserror ) {
          httpcode = 500
        }

        res.writeHead( httpcode, headers )
        res.end( outjson )
      })
    })
    
    seneca.log.info('listen', listen_options )
    var listen = app.listen( listen_options.port, listen_options.host )

    seneca.add('role:seneca,cmd:close',function( close_args, done ) {
      var closer = this

      listen.close()
      closer.prior(close_args,done)
    })

    //done(null,listen)
    done()
  }



  function hook_client_web( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = seneca.util.clean(_.extend({},options[type],args))

    make_client( seneca, make_send, client_options, clientdone )

    function make_send( spec, topic, send_done ) {
      var fullurl = 
            'http://'+client_options.host+':'+
            client_options.port+client_options.path

      seneca.log.debug('client', 'web', 'send', spec, topic, client_options, 
                       fullurl )
      
      send_done( null, function( args, done ) {
        var data = prepare_request( this, args, done )

        var headers = {
          'seneca-id':               data.id, 
          'seneca-kind':             'req', 
          'seneca-origin':           seneca.id, 
          'seneca-track':            stringifyJSON(
            seneca,'send-track',data.track||[]),
          'seneca-time-client-sent': data.time.client_sent
        }

        needle.post( 
          fullurl, 
          data.act, 
          {
            json:    true,
            headers: headers,
            timeout: client_options.timeout,
          },
          function(err,res) {
            var data = {
              kind:  'res',
              res:   res && res.body,
              error: err
            }

            if( res ) {
              data.id     = res.headers['seneca-id']
              data.origin = res.headers['seneca-origin']
              data.accept = res.headers['seneca-accept']
              data.time = {
                client_sent: res.headers['seneca-time-client-sent'],
                listen_recv: res.headers['seneca-time-listen-recv'],
                listen_sent: res.headers['seneca-time-listen-sent'],
              }

              if( 200 !== res.statusCode ) {
                data.error = res.body
              }
            }

            handle_response( seneca, data, client_options )
            
          }
        )


      })
    }
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

    if( pins ) {
      pins = _.map(pins,function(pin){
        return _.isString(pin) ? jsonic(pin) : pin
      })
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

    argspatrun.mark = util.inspect(pins).replace(/\s+/g, '').replace(/\n/g, '')

    return argspatrun
  }



  function resolvetopic( opts, spec, args ) {
    var msgprefix = (null == options.msgprefix ? '' : options.msgprefix) 
    if( !spec.pin ) return function() { return msgprefix+'any' }

    var topicpin = _.clone(spec.pin)

    var topicargs = {}
    _.each(topicpin, function(v,k) { topicargs[k]=args[k] })

    var sb = []
    _.each( _.keys(topicargs).sort(), function(k){
      sb.push(k)
      sb.push('=')
      sb.push(topicargs[k])
      sb.push(',')
    })

    return msgprefix+(sb.join('')).replace(/[^\w\d]+/g,'_')
  }



  function make_resolvesend( opts, sendmap, make_send ) {
    return function( spec, args, done ) {
      var topic = resolvetopic(opts,spec,args)
      var send = sendmap[topic]
      if( send ) return done(null,send);

      make_send(spec,topic,function(err,send){
        if( err ) return done(err)
        sendmap[topic] = send
        done(null,send)
      })
    }
  }



  function make_anyclient( opts, make_send, done ) {
    var msgprefix = (null == options.msgprefix ? '' : options.msgprefix) 
    make_send( {}, msgprefix+'any', function( err, send ) {
      if( err ) return done(err);
      if( !_.isFunction(send) ) return done(seneca.fail('null-client',{opts:opts}));

      done( null, {
        id: nid(),
        toString: function(){ return 'any-'+this.id },
        match: function( args ) { 
          return !this.has(args)
        },
        send: function( args, done ) {
          send.call(this,args,done)
        }
      })
    })
  }



  function make_pinclient( resolvesend, argspatrun, done ) {  
    done(null, {
      id: nid(),
      toString: function(){ return 'pin-'+argspatrun.mark+'-'+this.id },
      match: function( args ) {
        var match = !!argspatrun.find(args)
        return match
      },
      send: function( args, done ) {
        var seneca = this
        var spec = argspatrun.find(args)
        resolvesend(spec,args,function(err, send){
          if( err ) return done(err);
          send.call(seneca,args,done)
        })
      }
    })
  }



  function prepare_response( seneca, input ) {
    return {
      id:     input.id,
      kind:   'res',
      origin: input.origin,
      accept: seneca.id,
      track:  input.track,
      time: { 
        client_sent:(input.time&&input.time.client_sent), 
        listen_recv:Date.now() 
      },
    }
  }



  function update_output( input, output, err, out ) {
    output.res = out

    if( err ) {
      var errobj     = _.extend({},err)
      errobj.message = err.message
      errobj.name    = err.name || 'Error'

      output.error = errobj
      output.input = input
    }

    output.time.listen_sent = Date.now()
  }



  function catch_act_error( seneca, e, listen_options, input, output ) {
    seneca.log.error('listen', 'act-error', listen_options, e.stack || e )
    output.error = e
    output.input = input
  }



  function listen_topics( seneca, args, listen_options, do_topic ) {
    var msgprefix = (null == options.msgprefix ? '' : options.msgprefix) 
    var pins      = resolve_pins( args )

    if( pins ) {
      _.each( seneca.findpins( pins ), function(pin) {

        var sb = []
        _.each( _.keys(pin).sort(), function(k){
          sb.push(k)
          sb.push('=')
          sb.push(pin[k])
          sb.push(',')
        })

        var topic = msgprefix+(sb.join('')).replace(/[^\w\d]+/g,'_')
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
      if( options.warn.invalid_kind ) {
        seneca.log.error('client', 'invalid-kind', client_options, data)
      }
      return false
    }

    if( null == data.id ) {
      if( options.warn.no_message_id ) {
        seneca.log.error('client', 'no-message-id', client_options, data);
      }
      return false;
    }

    var callmeta = callmap.get(data.id)

    if( callmeta ) {
      callmap.del( data.id )
    }
    else {
      if( options.warn.unknown_message_id ) {
        seneca.log.warn('client', 'unknown-message-id', client_options, data);
      }
      return false;
    }

    var err = null
    if( data.error ) {
      err = new Error( data.error.message )

      _.each(data.error,function(v,k){
        err[k] = v
      })
    }
    
    var result = handle_entity(data.res)

    try {
      callmeta.done( err, result ) 
    }
    catch(e) {
      seneca.log.error('client', 'callback-error', client_options, data, e.stack||e)
    }

    return true;
  }



  function prepare_request( seneca, args, done ) {
    var callmeta = {
      args: args,
      done: _.bind(done,seneca),
      when: Date.now()
    }
    callmap.set(args.actid$,callmeta) 

    var track = []
    if( args.transport$ ) {
      track = _.clone((args.transport$.track||[]))
    }
    track.push(seneca.id)

    var output = {
      id:     args.actid$,
      kind:   'act',
      origin: seneca.id,
      track:  track,
      time:   { client_sent:Date.now() },
      act:    seneca.util.clean(args),
    }

    return output;
  }



  function handle_request( seneca, data, listen_options, respond ) {
    if( null == data ) return respond(null);

    if( 'act' != data.kind ) {
      if( options.warn.invalid_kind ) {
        seneca.log.warn('listen', 'invalid-kind', listen_options, data)
      }
      return respond(null);
    }

    if( null == data.id ) {
      if( options.warn.no_message_id ) {
        seneca.log.warn('listen', 'no-message-id', listen_options, data)
      }
      return respond(null);
    }

    if( options.check.own_message && callmap.has(data.id) ) {
      if( options.warn.own_message ) {
        seneca.log.warn('listen', 'own_message', listen_options, data)
      }
      return respond(null);
    }

    if( options.check.message_loop &&  _.isArray(data.track) ) {
      for( var i = 0; i < data.track.length; i++ ) {
        if( seneca.id === data.track[i] ) {
          if( options.warn.message_loop ) {
            seneca.log.warn('listen', 'message_loop', listen_options, data)
          }
          return respond(null);
        }
      }
    }

    if( data.error ) {
      seneca.log.error('listen', 'data-error', listen_options, data )
      return respond(null);
    }

    var output = prepare_response( seneca, data )
    var input  = handle_entity( data.act )

    input.transport$ = {
      track: data.track || []
    }

    input.actid$ = data.id

    try {
      seneca.act( input, function( err, out ) {
        update_output(input,output,err,out)
          
        respond(output)
      })
    }
    catch(e) {
      catch_act_error( seneca, e, listen_options, data, output )
      respond(output)
    }
  }



  function make_client( context_seneca, make_send, client_options, clientdone ) {
    var instance = seneca

    // legacy api
    if( !context_seneca.seneca ) {
      clientdone     = client_options
      client_options = make_send
      make_send      = context_seneca
    }
    else {
      instance = context_seneca
    }

    var pins = resolve_pins( client_options )
    instance.log.info( 'client', client_options, pins||'any' )

    if( pins ) {
      var argspatrun  = make_argspatrun( pins )
      var resolvesend = make_resolvesend( client_options, {}, make_send )

      make_pinclient( resolvesend, argspatrun, function( err, send ) {
        if( err ) return clientdone(err);
        clientdone( null, send )
      })
    }
    else {
      make_anyclient( client_options, make_send, function( err, send ) {
        if( err ) return clientdone(err);
        clientdone( null, send )
      })
    }
  }



  function parseJSON( seneca, note, str ) {
    if( str ) {
      try {
        return JSON.parse( str )
      }
      catch( e ) {
        seneca.log.warn( 'json-parse', note, str, e.stack||e.message )
      }
    }
  }



  function stringifyJSON( seneca, note, obj ) {
    if( obj ) {
      try {
        return JSON.stringify( obj )
      }
      catch( e ) {
        seneca.log.warn( 'json-stringify', note, obj, e.stack||e.message )
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
