/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
'use strict'

// Load modules

var Buffer = require('buffer')
var Util = require('util')
var _ = require('lodash')
var Connect = require('connect')
var Hoek = require('hoek')
var Jsonic = require('jsonic')
var LruCache = require('lru-cache')
var Needle = require('needle')
var Query = require('connect-query')
var Timeout = require('connect-timeout')
var Tcp = require('./lib/tcp')
var TransportUtil = require('./lib/transport-utils.js')

// Declare internals

var internals = {
  defaults: {
    msgprefix: 'seneca_',
    callmax: 111111,
    msgidlen: 12,
    warn: {
      unknown_message_id: true,
      invalid_kind: true,
      invalid_origin: true,
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
  var transportUtil = new TransportUtil({
    callmap: callmap,
    seneca: seneca,
    options: settings
  })

  seneca.add({ role: internals.plugin, cmd: 'inflight' }, internals.inflight(callmap))
  seneca.add({ role: internals.plugin, cmd: 'listen' }, internals.listen)
  seneca.add({ role: internals.plugin, cmd: 'client' }, internals.client)

  seneca.add({ role: internals.plugin, hook: 'listen', type: 'tcp' }, Tcp.listen(settings, transportUtil))
  seneca.add({ role: internals.plugin, hook: 'client', type: 'tcp' }, Tcp.client(settings, transportUtil))

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
    callmap.forEach(function (val, key) {
      inflight[key] = val
    })
    callback(null, inflight)
  }
}

internals.listen = function (args, callback) {
  var seneca = this

  var config = _.extend({}, args.config, { role: internals.plugin, hook: 'listen' })
  var listen_args = seneca.util.clean(_.omit(config, 'cmd'))
  var legacyError = internals.legacyError(seneca, listen_args.type)
  if (legacyError) {
    return callback(legacyError)
  }
  seneca.act(listen_args, callback)
}

internals.client = function (args, callback) {
  var seneca = this

  var config = _.extend({}, args.config, { role: internals.plugin, hook: 'client' })
  var client_args = seneca.util.clean(_.omit(config, 'cmd'))
  var legacyError = internals.legacyError(seneca, client_args.type)
  if (legacyError) {
    return callback(legacyError)
  }
  seneca.act(client_args, callback)
}

internals.legacyError = function (seneca, type) {
  if (type === 'pubsub') {
    return seneca.fail('plugin-needed', { name: 'seneca-redis-transport' })
  }
  if (type === 'queue') {
    return seneca.fail('plugin-needed', { name: 'seneca-beanstalkd-transport' })
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

    TransportUtil.close(seneca, function (done) {
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
          'seneca-track': TransportUtil.stringifyJSON(seneca, 'send-track', data.track || []),
          'seneca-time-client-sent': data.time.client_sent
        }

        Needle.post(
          url,
          data.act,
          {
            json: true,
            headers: headers,
            timeout: clientOptions.timeout
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
                listen_sent: res.headers['seneca-time-listen-sent']
              }

              if (res.statusCode !== 200) {
                data.error = res.body
              }
            }

            transportUtil.handle_response(seneca, data, clientOptions)
          }
        )
      })

      TransportUtil.close(seneca, function (done) {
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

        var bodydata = bufstr.length ? TransportUtil.parseJSON(seneca, 'req-body', bufstr) : {}

        if (Util.isError(bodydata)) {
          var out = TransportUtil.prepareResponse(seneca, {})
          out.input = bufstr
          out.error = TransportUtil.error('invalid_json', { input: bufstr })
          internals.sendResponse(seneca, transportUtil, res, out, {})
          return
        }

        req.body = _.extend({}, bodydata,
          (req.query && req.query.args$) ? Jsonic(req.query.args$) : {},
          req.query || {})

        next()
      } catch (err) {
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
    if (req.headers['seneca-id']) {
      data = {
        id: req.headers['seneca-id'],
        kind: 'act',
        origin: req.headers['seneca-origin'],
        track: TransportUtil.parseJSON(seneca, 'track-receive', req.headers['seneca-track']) || [],
        time: {
          client_sent: req.headers['seneca-time-client-sent']
        },
        act: req.body
      }
    }

    // convenience for non-seneca clients
    if (!req.headers['seneca-id']) {
      data = {
        id: seneca.idgen(),
        kind: 'act',
        origin: req.headers['user-agent'] || 'UNKNOWN',
        track: [],
        time: {
          client_sent: Date.now()
        },
        act: req.body
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
    outJson = TransportUtil.stringifyJSON(seneca, 'listen-web', out.res)
  } else if (out && out.error) {
    isError = true
    outJson = TransportUtil.stringifyJSON(seneca, 'listen-web', out.error)
  }

  var headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, max-age=0, no-cache, no-store',
    'Content-Length': Buffer.Buffer.byteLength(outJson)
  }

  headers['seneca-id'] = out && out.id ? out.id : seneca.id
  headers['seneca-kind'] = 'res'
  headers['seneca-origin'] = out && out.origin ? out.origin : 'UNKNOWN'
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
