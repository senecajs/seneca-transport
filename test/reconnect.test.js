/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'


var ChildProcess = require('child_process')
var Path = require('path')
var Code = require('code')
var Lab = require('lab')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect

describe('Reconnects', function () {
  it('handles reconnects', function (done) {
    var serverPath = Path.join(__dirname, 'reconnect', 'server.js')
    var clientPath = Path.join(__dirname, 'reconnect', 'client.js')

    var server = ChildProcess.fork(serverPath)
    var client = ChildProcess.fork(clientPath)
    var actedCount = 0

    server.once('message', function (address) {
      client.on('message', function (message) {
        if (!message.acted) {
          return
        }

        actedCount++
        server.kill('SIGKILL')
        setTimeout(function () {
          server = ChildProcess.fork(serverPath, [address.port])
        }, 50)
      })
      client.send({ port: address.port })

      var finish = function () {
        expect(actedCount).to.equal(1)
        server.kill('SIGKILL')
        client.kill('SIGKILL')
        done()
        finish = function () {}
      }

      setTimeout(finish, 500)
    })
  })
})
