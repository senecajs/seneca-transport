/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
'use strict'

// Load modules
var Net = require('net')
var Stream = require('stream')

// Declare internals
var internals = {}

exports.listen = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var listenOptions = seneca.util.deepextend(options[args.type], args)
    var processData = internals.processData(seneca, transportUtil, options)

    var connections = []
    var listenAttempts = 0

    var listener = Net.createServer(function (connection) {
      seneca.log.debug('listen', 'connection', listenOptions,
                       'remote', connection.remoteAddress, connection.remotePort)

      connection.on('data', function (data) {
        processData(data, function (result) {
          if (result) {
            connection.write(result)
            connection.write('\n')
          }
        })
      })

      connection.once('end', function () {
        seneca.log.debug('end', 'connection', listenOptions,
                         'remote', connection.remoteAddress, connection.remotePort)
      })

      connection.on('error', function (err) {
        seneca.log.error('listen', 'pipe-error', listenOptions, err && err.stack)
      })

      connections.push(connection)
    })

    listener.once('listening', function () {
      var address = listener.address()
      seneca.log.debug('listen', 'open', address)
      return callback(null, address)
    })

    listener.on('error', function (err) {
      seneca.log.error('listen', 'net-error', listenOptions, err && err.stack)

      if ('EADDRINUSE' === err.code && listenAttempts < listenOptions.max_listen_attempts) {
        listenAttempts++
        seneca.log.warn('listen', 'attempt', listenAttempts, err.code, listenOptions)
        setTimeout(listen, 100 + Math.floor(Math.random() * listenOptions.attempt_delay))
        return
      }
    })

    listener.once('close', function () {
      seneca.log.debug('listen', 'close', listenOptions)
    })

    function listen () {
      if (listenOptions.path) {
        return listener.listen(listenOptions.path)
      }

      listener.listen({ port: +listenOptions.port, host: listenOptions.host })
    }
    listen()

    transportUtil.close(seneca, function (next) {
      // node 0.10 workaround, otherwise it throws
      if (listener._handle) {
        listener.close()
      }
      internals.closeConnections(connections, seneca)
      next()
    })
  }
}

exports.client = function (options, transportUtil) {
  return function (args, callback) {
    var seneca = this
    var type = args.type
    if (args.host) {
      // under Windows host, 0.0.0.0 host will always fail
      args.host = args.host === '0.0.0.0' ? '127.0.0.1' : args.host
    }
    var clientOptions = seneca.util.deepextend(options[args.type], args)
    clientOptions.host = !args.host && clientOptions.host === '0.0.0.0' ? '127.0.0.1' : clientOptions.host
    var connectOptions = {
      port: +clientOptions.port,
      host: clientOptions.host
    }
    var finished = false
    var attempts = 0

    var make_send = function (spec, topic, send_made) {
      seneca.log.debug('client', type, 'send-init', spec, topic, clientOptions)

      attempts++
      var connection = Net.createConnection(connectOptions, function () {
        var msger = internals.clientMessager(seneca, clientOptions, transportUtil)
        msger.on('error', function (err) {
          seneca.log.error('client', type, 'error', err && err.stack)
        })

        connection.on('data', function (chunk) {
          var parsed = internals.parseChunk(chunk)
          if (!parsed) {
            return
          }
          msger.write(parsed)
        })

        connection.on('error', function (err) {
          seneca.log.debug('client', type, 'error', spec, topic, clientOptions, err.stack)
        })

        connection.on('end', function () {
          // check if send is done, if not, call send again
          if (!finished && attempts < 5) {
            setImmediate(function () {
              make_send(spec, topic, send_made)
              connection.destroy()
            })
          }
        })

        send_made(null, function (args, done) {
          var outmsg = transportUtil.prepare_request(this, args, done)
          connection.write(JSON.stringify(outmsg))
          connection.write('\n')
          finished = true
        })
      })

      transportUtil.close(seneca, function (done) {
        connection && connection.end && connection.end()
        done()
      })
    }

    transportUtil.make_client(seneca, make_send, clientOptions, callback)
  }
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

internals.closeConnections = function (connections, seneca) {
  for (var i = 0, il = connections.length; i < il; ++i) {
    internals.destroyConnection(connections[i], seneca)
  }
}

internals.destroyConnection = function (connection, seneca) {
  try {
    connection.destroy()
  }
  catch (e) {
    seneca.log.error(e)
  }
}

internals.processData = function (seneca, transportUtil, options) {
  return function (data, callback) {
    var parsed = internals.parseChunk(data)
    if (parsed) {
      transportUtil.handle_request(seneca, parsed, options, function (out) {
        if (out === null || !out.sync) {
          return callback()
        }

        callback(JSON.stringify(out))
      })
      return
    }

    var out = transportUtil.prepareResponse(seneca, {})
    out.input = data.input
    out.error = transportUtil.error('invalid_json', { input: data.toString() })

    callback(JSON.stringify(out))
  }
}

internals.parseChunk = function (chunk) {
  var stringified = chunk.toString()
  try {
    return JSON.parse(stringified)
  }
  catch (e) {
    return
  }
}
