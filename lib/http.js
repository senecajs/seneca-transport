/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
'use strict'

// Load modules
var Buffer = require('buffer')
var Http = require('http')
var Qs = require('qs')
var Url = require('url')
var Util = require('util')
var _ = require('lodash')
var Jsonic = require('jsonic')
var Wreck = require('wreck')

// Declare internals
var internals = {}

exports.listen = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var listenOptions = seneca.util.deepextend(options[args.type], args)

    var server = Http.createServer(function (req, res) {
      internals.timeout(listenOptions, req, res)
      req.query = Qs.parse(Url.parse(req.url).query)
      internals.setBody(seneca, transportUtil, req, res, function (err) {
        if (err) {
          return res.end()
        }

        internals.trackHeaders(listenOptions, seneca, transportUtil, req, res)
      })
    })

    seneca.log.debug('listen', listenOptions)
    var listener = server.listen(listenOptions.port, listenOptions.host)

    transportUtil.close(seneca, function (done) {
      // node 0.10 workaround, otherwise it throws
      if (listener._handle) {
        listener.close()
      }
      done()
    })

    callback()
  }
}

exports.client = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var clientOptions = seneca.util.deepextend(options[args.type], args)

    var send = function (spec, topic, send_done) {
      var url = 'http://' + clientOptions.host + ':' + clientOptions.port + clientOptions.path
      seneca.log.debug('client', 'web', 'send', spec, topic, clientOptions, url)

      send_done(null, function (args, done) {
        var data = transportUtil.prepare_request(this, args, done)

        var headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'seneca-id': data.id,
          'seneca-kind': 'req',
          'seneca-origin': seneca.id,
          'seneca-track': transportUtil.stringifyJSON(seneca, 'send-track', data.track || []),
          'seneca-time-client-sent': data.time.client_sent
        }

        var requestOptions = {
          json: true,
          headers: headers,
          timeout: clientOptions.timeout,
          payload: JSON.stringify(data.act)
        }

        Wreck.post(url, requestOptions, function (err, res, payload) {
          var data = {
            kind: 'res',
            res: payload && _.isObject(payload) ? payload : null,
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
              data.error = payload
            }
          }

          transportUtil.handle_response(seneca, data, clientOptions)
        })
      })

      transportUtil.close(seneca, function (done) {
        done()
      })
    }

    transportUtil.make_client(seneca, send, clientOptions, callback)
  }
}

internals.setBody = function (seneca, transportUtil, req, res, next) {
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
        var out = transportUtil.prepareResponse(seneca, {})
        out.input = bufstr
        out.error = transportUtil.error('invalid_json', { input: bufstr })
        internals.sendResponse(seneca, transportUtil, res, out, {})
        return
      }

      req.body = _.extend({}, bodydata,
        (req.query && req.query.args$) ? Jsonic(req.query.args$) : {},
        req.query || {})

      next()
    }
    catch (err) {
      res.write(err.message + ': ' + bufstr)
      res.statusCode = 400
      next(err)
    }
  })
}

internals.trackHeaders = function (listenOptions, seneca, transportUtil, req, res) {
  if (req.url.indexOf(listenOptions.path) !== 0) {
    return
  }
  var data
  if (req.headers['seneca-id']) {
    data = {
      id: req.headers['seneca-id'],
      kind: 'act',
      origin: req.headers['seneca-origin'],
      track: transportUtil.parseJSON(seneca, 'track-receive', req.headers['seneca-track']) || [],
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

internals.timeout = function (listenOptions, req, res) {
  var id = setTimeout(function () {
    res.statusCode = 503
    res.statusMessage = 'Response timeout'
    res.end('{ "code": "ETIMEDOUT" }')
  }, listenOptions.timeout || 5000)

  var clearTimeoutId = function () {
    clearTimeout(id)
  }

  req.once('close', clearTimeoutId)
  req.once('error', clearTimeoutId)
  res.once('error', clearTimeoutId)
  res.socket.once('data', clearTimeoutId)
}
