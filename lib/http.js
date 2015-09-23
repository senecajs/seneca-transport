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
var Needle = require('needle')
var Query = require('connect-query')
var Timeout = require('connect-timeout')
var TransportUtil = require('./transport-utils.js')

// Declare internals
var internals = {}

exports.listen = function (options, transportUtil) {
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

exports.client = function (options, transportUtil) {
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
