/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
"use strict";


var buffer = require('buffer')
var util   = require('util')
var net    = require('net')
var stream = require('stream')


var _         = require('lodash')
var connect   = require('connect')
var needle    = require('needle')
var lrucache  = require('lru-cache')
var reconnect = require('reconnect-net')
var timeout   = require('connect-timeout')
var query     = require('connect-query')
var jsonic    = require('jsonic')

var error = require('eraro')({
  package:  'seneca',
  msgmap:   ERRMSGMAP(),
  override: true
})


var make_tu = require('./lib/transport-utils.js')


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

  // Utility functions, bound to this transport context
  var tu = make_tu( { callmap:callmap, seneca:seneca, options:options } )


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

    var listen_config = args.config
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

    var client_config = args.config
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

        if( util.isError(data) ) {
          var out = tu.prepare_response(seneca,{})
          out.input = data.input
          out.error = error('invalid_json',{input:data.input})

          stream_instance.push(out)
          return done()
        }

        tu.handle_request( seneca, data, listen_options, function(out) {
          if( null == out ) return done();
          stream_instance.push(out)
          return done();
        })
      }
      return msger
    }

    var connections = []

    var listen = net.createServer(function(connection) {
      seneca.log.debug('listen', 'connection', listen_options,
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
      seneca.log.debug('listen', 'open', 
                       listen_options)
      done()
    })

    listen.on('error', function(err) {
      seneca.log.error('listen', 'net-error', listen_options, err.stack||err)
    })

    listen.on('close', function() {
      seneca.log.debug('listen', 'close', listen_options)
    })

    listen.listen( listen_options.port, listen_options.host )

    tu.close( seneca, function(done){
      listen.close()

      connections.forEach(function(con){
        try { con.destroy() } catch(e) { seneca.log.error(e) }
      })

      done()
    })
  }



  function hook_client_tcp( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = seneca.util.clean(_.extend({},options[type],args))

    tu.make_client( seneca, make_send, client_options, clientdone )


    function make_send( spec, topic, send_done ) {
      seneca.log.debug('client', type, 'send-init', 
                       spec, topic, client_options)

      function make_msger() {
        var msger = new stream.Duplex({objectMode:true})
        msger._read = function() {}
        msger._write = function( data, enc, done ) {
          tu.handle_response( seneca, data, client_options )
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
        var outmsg = tu.prepare_request( this, args, done )
        msger.push( outmsg )
      })

      tu.close( seneca, function( done ) {
        clientconnect.disconnect()

        connections.forEach(function(con){
          try { con.destroy() } catch(e) { seneca.log.error(e) }
        })

        done()
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

        var outdata = tu.parseJSON( seneca, 'stream', jsonstr )

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
      var out = tu.stringifyJSON( seneca, 'stream', data )
    
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

          var bodydata = 
                0 < bufstr.length ? tu.parseJSON(seneca,'req-body',bufstr) : {}

          if( util.isError(bodydata) ) {
            var out = tu.prepare_response(seneca,{})
            out.input = bufstr
            out.error = error('invalid_json',{input:bufstr})
            send_response(res,out,{})
            return;
          }

          req.body = _.extend(
            {},
            bodydata,
            (req.query && req.query.args$) ? jsonic(req.query.args$) : {},
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
          track:  tu.parseJSON(
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

      tu.handle_request( seneca, data, listen_options, function(out){
        send_response(res,out,data)
      })
    })
    

    seneca.log.debug('listen', listen_options )
    var listen = app.listen( listen_options.port, listen_options.host )

    tu.close( seneca, function( done ) {
      listen.close()
      done()
    })

    function send_response(res,out,data) {
      var outjson  = "null"
      var iserror  = false
      var httpcode = 200

      if( null != out ) {
        if( out.res ) {
          outjson = tu.stringifyJSON(seneca,'listen-web',out.res)
        }
        else if( out.error ) {
          iserror = true
          outjson = tu.stringifyJSON(seneca,'listen-web',out.error)
        }
      }

      var headers = {
        'Content-Type':   'application/json',
        'Cache-Control':  'private, max-age=0, no-cache, no-store',
        'Content-Length': buffer.Buffer.byteLength(outjson),
      }
      
      headers['seneca-id']     = out ? out.id : seneca.id
      headers['seneca-kind']   = 'res'
      headers['seneca-origin'] = out ? out.origin : 'UNKNOWN'
      headers['seneca-accept'] = seneca.id
      headers['seneca-track']  = ''+(data.track ? data.track : [])
      headers['seneca-time-client-sent'] = 
        out && out.item ? out.time.client_sent : '0'
      headers['seneca-time-listen-recv'] = 
        out && out.item ? out.time.listen_recv : '0'
      headers['seneca-time-listen-sent'] = 
        out && out.item ? out.time.listen_sent : '0'
      
      if( iserror ) {
        httpcode = 500
      }

      res.writeHead( httpcode, headers )
      res.end( outjson )
    }

    done()
  }



  function hook_client_web( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = seneca.util.clean(_.extend({},options[type],args))

    tu.make_client( seneca, make_send, client_options, clientdone )

    function make_send( spec, topic, send_done ) {
      var fullurl = 
            'http://'+client_options.host+':'+
            client_options.port+client_options.path

      seneca.log.debug('client', 'web', 'send', spec, topic, client_options, 
                       fullurl )
      
      send_done( null, function( args, done ) {
        var data = tu.prepare_request( this, args, done )

        var headers = {
          'seneca-id':               data.id, 
          'seneca-kind':             'req', 
          'seneca-origin':           seneca.id, 
          'seneca-track':            tu.stringifyJSON(
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
              res:   res && _.isObject(res.body) ? res.body : null,
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

            tu.handle_response( seneca, data, client_options )
          }
        )
      })

      tu.close( seneca, function( done ) {
        done()
      })
    }
  }  


  return {
    name:      plugin,
    exportmap: { utils: tu },
    options:   options
  }
}


// Error code messages.
function ERRMSGMAP() {
  return {
    'invalid_json':'Invalid JSON: <%=input%>.',
  }
}
