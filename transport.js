/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
'use strict'

// Load modules

var Buffer = require('buffer')
var Util = require('util')
var Net = require('net')
var Stream = require('stream')
var _ = require('lodash')
var Connect = require('connect')
var Eraro = require('eraro')
var Hoek = require('hoek')
var Jsonic = require('jsonic')
var LruCache = require('lru-cache')
var Needle = require('needle')
var Query = require('connect-query')
var Reconnect = require('reconnect-core')
var Timeout = require('connect-timeout')
var TransportUtil = require('./lib/transport-utils.js')


// Declare internals

var internals = {
  error: Eraro({
    package:  'seneca',
    msgmap: {
      'invalid_json': 'Invalid JSON: <%=input%>.'
    },
    override: true
  }),
  defaults: {
    msgprefix: 'seneca_',
    callmax: 111111,
    msgidlen: 12,
    warn: {
      unknown_message_id: true,
      invalid_kind: true,
      invalid_origin:true,
      no_message_id: true,
      message_loop: true,
      own_message: true
    },
    check: {
      message_loop: true,
      own_message: true
    },
    web: {
      type: 'web',
      port: 10101,
      host: '0.0.0.0',
      path: '/act',
      protocol: 'http',
      timeout: 5555
    },
    tcp: {
      type: 'tcp',
      host: '0.0.0.0',
      port: 10201,
      timeout: 5555
    }
  },
  plugin: 'transport'
}


module.exports = function (options) {
  var seneca = this
  var settings = Hoek.applyToDefaults(internals.defaults, options)
  var callmap = LruCache(settings.callmax)
  var transportUtil = TransportUtil({
    callmap: callmap,
    seneca: seneca,
    options: settings
  })

  seneca.add({ role: internals.plugin, cmd: 'inflight' }, internals.inflight(callmap))
  seneca.add({ role: internals.plugin, cmd: 'listen' }, internals.listen)
  seneca.add({ role: internals.plugin, cmd: 'client' }, internals.client)

  seneca.add({ role: internals.plugin, hook: 'listen', type: 'tcp' },
      internals.hookListenTcp(settings, transportUtil))
  seneca.add({ role: internals.plugin, hook: 'client', type: 'tcp' },
      internals.hookClientTcp(settings, transportUtil))

  seneca.add({ role: internals.plugin, hook: 'listen', type: 'web' },
      internals.hookListenWeb(settings, transportUtil))
  seneca.add({ role: internals.plugin, hook: 'client', type: 'web' },
      internals.hookClientWeb(settings, transportUtil))

  // Aliases.
  seneca.add({ role: internals.plugin, hook: 'listen', type: 'http' },
      internals.hookListenWeb(settings, transportUtil))
  seneca.add({ role: internals.plugin, hook: 'client', type: 'http' },
      internals.hookClientWeb(settings, transportUtil))

  // Legacy API.
  seneca.add({ role: internals.plugin, hook: 'listen', type: 'direct' },
      internals.hookListenWeb(settings, transportUtil))
  seneca.add({ role: internals.plugin, hook: 'client', type: 'direct' },
      internals.hookClientWeb(settings, transportUtil))

  return {
    name: internals.plugin,
    exportmap: { utils: transportUtil },
    options: settings
  }
}


internals.inflight = function (callmap) {
  return function (args, callback) {
    var inflight = {}
    callmap.forEach(function(val, key) {
      inflight[key] = val
    })
    callback(null, inflight)
  }
}


internals.listen = function (args, callback) {
  var seneca = this

  var config = _.extend({}, args.config, { role: internals.plugin, hook: 'listen' })
  var listen_args = seneca.util.clean(_.omit(config, 'cmd'))
  var legacyError = internals.legacyError(listen_args.type)
  if (legacyError) {
    return callback(legacyError)
  }
  seneca.act(listen_args, callback)
}


internals.client = function (args, callback) {
  var seneca = this

  var config = _.extend({}, args.config, { role: internals.plugin, hook: 'client' })
  var client_args = seneca.util.clean(_.omit(config, 'cmd'))
  var legacyError = internals.legacyError(client_args.type)
  if (legacyError) {
    return callback(legacyError)
  }
  seneca.act(client_args, callback)
}


internals.legacyError = function (type) {
  if (type === 'pubsub') {
    return seneca.fail('plugin-needed', { name:'seneca-redis-transport' })
  }
  if (type === 'queue') {
    return seneca.fail('plugin-needed', { name:'seneca-beanstalkd-transport' })
  }
}


internals.hookListenTcp = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var listenOptions = Hoek.applyToDefaults(options[args.type], args)

    var connections = []

    var listener = Net.createServer(function (connection) {
      seneca.log.debug('listen', 'connection', listenOptions,
                       'remote', connection.remoteAddress, connection.remotePort)
      connection
        .pipe(internals.jsonStreamParser(seneca, transportUtil))
        .pipe(internals.requestMessager(seneca, listenOptions, transportUtil))
        .pipe(internals.jsonStringifyStream(seneca, transportUtil))
        .pipe(connection)

      connection.on('error', function(err) {
        seneca.log.error('listen', 'pipe-error', listenOptions, err && err.stack)
      })

      connections.push(connection)
    })

    listener.on('listening', function () {
      seneca.log.debug('listen', 'open', listenOptions)
      return callback()
    })

    listener.on('error', function (err) {
      seneca.log.error('listen', 'net-error', listenOptions, err && err.stack)
    })

    listener.on('close', function () {
      seneca.log.debug('listen', 'close', listenOptions)
    })

    listener.listen(listenOptions.port, listenOptions.host)

    transportUtil.close(seneca, function (next) {
      listener.close()
      internals.closeConnections(connections, seneca)
      next()
    })
  }
}


internals.hookClientTcp = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var type = args.type
    var clientOptions = Hoek.applyToDefaults(options[args.type], args)

    var send = function (spec, topic, send_done) {
      seneca.log.debug('client', type, 'send-init', spec, topic, clientOptions)

      var msger = internals.clientMessager(seneca, clientOptions, transportUtil)
      var connections = []

      var clientconnect = internals.reconnect(function (client) {
        connections.push(client)

        client
          .pipe(internals.jsonStreamParser(seneca, transportUtil))
          .pipe(msger)
          .pipe(internals.jsonStringifyStream(seneca, transportUtil))
          .pipe(client)

      }).on('connect', function () {
          seneca.log.debug('client', type, 'connect', spec, topic, clientOptions)

      }).on('reconnect', function () {
          seneca.log.debug('client', type, 'reconnect', spec, topic, clientOptions)

      }).on('disconnect', function (err) {
          seneca.log.debug('client', type, 'disconnect', spec, topic, clientOptions,
                           (err && err.stack) || err)

      }).connect({
        port: clientOptions.port,
        host: clientOptions.host
      })

      send_done(null, function (args, done) {
        var outmsg = transportUtil.prepare_request(this, args, done)
        msger.push(outmsg)
      })

      transportUtil.close(seneca, function (done) {
        clientconnect.disconnect()

        internals.closeConnections(connections, seneca)
        done()
      })
    }

    transportUtil.make_client(seneca, send, clientOptions, callback)
  }
}


internals.hookListenWeb = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var listenOptions = Hoek.applyToDefaults(options[args.type], args)

    var app = Connect()
    app.use(Timeout(listenOptions.timeout))

    // query params get injected into args
    // let's you use a GET for debug
    // GETs can have side-effects, this is not a web server, or a REST API
    app.use(Query())

    app.use(internals.setBody(seneca, transportUtil))
    app.use(internals.trackHeaders(listenOptions, seneca, transportUtil))

    seneca.log.debug('listen', listenOptions)
    var listener = app.listen(listenOptions.port, listenOptions.host)

    transportUtil.close(seneca, function (done) {
      listener.close()
      done()
    })

    callback()
  }
}


internals.hookClientWeb = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var clientOptions = Hoek.applyToDefaults(options[args.type], args)

    var send = function (spec, topic, send_done) {
      var url = 'http://' + clientOptions.host + ':' + clientOptions.port + clientOptions.path
      seneca.log.debug('client', 'web', 'send', spec, topic, clientOptions, url)

      send_done(null, function (args, done) {
        var data = transportUtil.prepare_request(this, args, done)

        var headers = {
          'seneca-id': data.id,
          'seneca-kind': 'req',
          'seneca-origin': seneca.id,
          'seneca-track': transportUtil.stringifyJSON(seneca, 'send-track', data.track || []),
          'seneca-time-client-sent': data.time.client_sent
        }

        Needle.post(
          url,
          data.act,
          {
            json:    true,
            headers: headers,
            timeout: clientOptions.timeout,
          },
          function (err, res) {
            var data = {
              kind: 'res',
              res: res && _.isObject(res.body) ? res.body : null,
              error: err
            }

            if (res) {
              data.id = res.headers['seneca-id']
              data.origin = res.headers['seneca-origin']
              data.accept = res.headers['seneca-accept']
              data.time = {
                client_sent: res.headers['seneca-time-client-sent'],
                listen_recv: res.headers['seneca-time-listen-recv'],
                listen_sent: res.headers['seneca-time-listen-sent'],
              }

              if (res.statusCode !== 200) {
                data.error = res.body
              }
            }

            transportUtil.handle_response(seneca, data, clientOptions)
          }
        )
      })

      transportUtil.close(seneca, function (done) {
        done()
      })
    }

    transportUtil.make_client(seneca, send, clientOptions, callback)
  }
}


internals.setBody = function (seneca, transportUtil) {
  return function (req, res, next) {
    var buf = []
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      buf.push(chunk)
    })
    req.on('end', function () {
      try {
        var bufstr = buf.join('')

        var bodydata = bufstr.length ? transportUtil.parseJSON(seneca, 'req-body', bufstr) : {}

        if (Util.isError(bodydata)) {
          var out = transportUtil.prepare_response(seneca, {})
          out.input = bufstr
          out.error = internals.error('invalid_json', { input: bufstr })
          internals.sendResponse(seneca, transportUtil, res, out, {})
          return
        }

        req.body = _.extend({}, bodydata,
          (req.query && req.query.args$) ? Jsonic(req.query.args$) : {},
          req.query || {})

        next()
      }
      catch (err) {
        err.body = err.message + ': ' + bufstr
        err.status = 400
        next(err)
      }
    })
  }
}


internals.trackHeaders = function (listenOptions, seneca, transportUtil) {
  return function (req, res, next) {
    if (req.url.indexOf(listenOptions.path) !== 0) {
      return next()
    }
    var data
    if (!!req.headers['seneca-id']) {
      data = {
        id: req.headers['seneca-id'],
        kind: 'act',
        origin: req.headers['seneca-origin'],
        track: transportUtil.parseJSON(seneca, 'track-receive', req.headers['seneca-track']) || [],
        time: {
          client_sent: req.headers['seneca-time-client-sent'],
        },
        act: req.body
      }
    }

    // convenience for non-seneca clients
    else {
      data = {
        id: seneca.idgen(),
        kind: 'act',
        origin: req.headers['user-agent'] || 'UNKNOWN',
        track: [],
        time: {
          client_sent: Date.now()
        },
        act: req.body,
      }
    }

    transportUtil.handle_request(seneca, data, listenOptions, function (out) {
      internals.sendResponse(seneca, transportUtil, res, out, data)
    })
  }
}

internals.sendResponse = function (seneca, transportUtil, res, out, data) {
  var outJson = 'null'
  var isError = false
  var httpcode = 200

  if (out && out.res) {
    outJson = transportUtil.stringifyJSON(seneca, 'listen-web', out.res)
  }
  else if (out && out.error) {
    isError = true
    outJson = transportUtil.stringifyJSON(seneca, 'listen-web', out.error)
  }

  var headers = {
    'Content-Type':   'application/json',
    'Cache-Control':  'private, max-age=0, no-cache, no-store',
    'Content-Length': Buffer.Buffer.byteLength(outJson),
  }

  headers['seneca-id'] = out && out.id ? out.id : seneca.id
  headers['seneca-kind'] = 'res'
  headers['seneca-origin'] = out && out.origin ? out.origin: 'UNKNOWN'
  headers['seneca-accept'] = seneca.id
  headers['seneca-track'] = '' + (data.track ? data.track : [])
  headers['seneca-time-client-sent'] =
    out && out.item ? out.time.client_sent : '0'
  headers['seneca-time-listen-recv'] =
    out && out.item ? out.time.listen_recv : '0'
  headers['seneca-time-listen-sent'] =
    out && out.item ? out.time.listen_sent : '0'

  if (isError) {
    httpcode = 500
  }

  res.writeHead(httpcode, headers)
  res.end(outJson)
}


internals.closeConnections = function (connections, seneca) {
  connections.forEach(function (con) {
    try {
      con.destroy()
    } catch(e) {
      seneca.log.error(e)
    }
  })
}

internals.requestMessager = function (seneca, options, transportUtil) {
  var messager = new Stream.Duplex({ objectMode: true })
  messager._read = function () {}
  messager._write = function (data, enc, next) {
    var stream = this

    if (Util.isError(data)) {
      var out = transportUtil.prepare_response(seneca, {})
      out.input = data.input
      out.error = internals.error('invalid_json', { input: data.input })

      stream.push(out)
      return next()
    }

    transportUtil.handle_request(seneca, data, options, function (out) {
      if (out === null) {
        return next()
      }

      stream.push(out)
      return next()
    })
  }
  return messager
}

internals.clientMessager = function (seneca, options, transportUtil) {
  var messager = new Stream.Duplex({ objectMode: true })
  messager._read = function () {}
  messager._write = function (data, enc, callback) {
    transportUtil.handle_response(seneca, data, options)
    return callback()
  }
  return messager
}

internals.jsonStreamParser = function (seneca, transportUtil) {
  var parser = new Stream.Duplex({ objectMode: true })
  parser.linebuf = []
  parser._read = function () {}
  parser._write = function (data, enc, callback) {
    var str = '' + data
    var endline = -1
    var remain = 0

    while ((endline = str.indexOf('\n', remain)) !== -1) {
      this.linebuf.push(str.substring(remain, endline))
      var jsonstr = this.linebuf.join('')

      this.linebuf.length = 0
      remain = endline + 1

      if (jsonstr === '') {
        return callback()
      }

      var outdata = transportUtil.parseJSON(seneca, 'stream', jsonstr)

      if (outdata) {
        this.push(outdata)
      }
    }

    if (endline === -1) {
      this.linebuf.push(str.substring(remain))
    }

    return callback()
  }

  return parser
}


internals.jsonStringifyStream = function (seneca, transportUtil) {
  var stringify = new Stream.Duplex({ objectMode: true })
  stringify._read = function () {}
  stringify._write = function (data, enc, callback) {
    var out = transportUtil.stringifyJSON(seneca, 'stream', data)

    if (out) {
      this.push(out + '\n')
    }

    callback()
  }

  return stringify
}


internals.reconnect = Reconnect(function () {
  var args = [].slice.call(arguments)
  return Net.connect.apply(null, args)
})
