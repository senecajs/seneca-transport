/* Copyright (c) 2013-2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
'use strict'

// Load modules
var Util = require('util')
var Net = require('net')
var Stream = require('stream')
var Hoek = require('hoek')
var Reconnect = require('reconnect-core')

// Declare internals
var internals = {}

exports.listen = function (options, transportUtil) {
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

      connection.on('error', function (err) {
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

exports.client = function (options, transportUtil) {
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

internals.requestMessager = function (seneca, options, transportUtil) {
  var messager = new Stream.Duplex({ objectMode: true })
  messager._read = function () {}
  messager._write = function (data, enc, next) {
    var stream = this

    if (Util.isError(data)) {
      var out = transportUtil.prepareResponse(seneca, {})
      out.input = data.input
      out.error = transportUtil.error('invalid_json', { input: data.input })

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

internals.closeConnections = function (connections, seneca) {
  connections.forEach(function (con) {
    try {
      con.destroy()
    } catch(e) {
      seneca.log.error(e)
    }
  })
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
