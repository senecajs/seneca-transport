/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'

var Fs = require('fs')
var Code = require('code')
var Lab = require('lab')
var Seneca = require('seneca')
var Tcp = require('../lib/tcp')
var TransportUtil = require('../lib/transport-utils')


// Test shortcuts

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect


describe('tcp', function () {
  describe('listen()', function () {
    it('can listen on ephemeral port', function (done) {
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        tcp: {
          port: 0,
          host: 'localhost'
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var tcp = Tcp.listen(settings, transportUtil)
      expect(typeof tcp).to.equal('function')

      tcp.call(seneca, { type: 'tcp' }, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('can listen on unix path', {skip: /win/.test(process.platform)}, function (done) {
      var sock = '/tmp/seneca.sock'
      // Remove existing sock file
      if (Fs.existsSync(sock)) {
        Fs.unlinkSync(sock)
      }

      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        tcp: {
          path: sock
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var tcp = Tcp.listen(settings, transportUtil)
      expect(typeof tcp).to.equal('function')

      tcp.call(seneca, { type: 'tcp' }, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('will retry listening a specified number of times', function (done) {
      var seneca1 = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var seneca2 = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings1 = {
        tcp: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil1 = new TransportUtil({
        callmap: callmap,
        seneca: seneca1,
        options: settings1
      })

      var tcp1 = Tcp.listen(settings1, transportUtil1)
      expect(typeof tcp1).to.equal('function')

      tcp1.call(seneca1, { type: 'tcp' }, function (err, address) {
        expect(err).to.not.exist()

        var settings2 = {
          tcp: {
            port: address.port,
            max_listen_attempts: 10,
            attempt_delay: 10
          }
        }
        var transportUtil2 = new TransportUtil({
          callmap: callmap,
          seneca: seneca2,
          options: settings2
        })
        var tcp2 = Tcp.listen(settings2, transportUtil2)
        expect(typeof tcp2).to.equal('function')

        setTimeout(function () {
          seneca1.close()
        }, 20)

        tcp2.call(seneca2, { type: 'tcp' }, function (err, address) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })

  describe('client()', function () {
    it('defaults to 127.0.0.1 for connections', function (done) {
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        tcp: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var server = Tcp.listen(settings, transportUtil)
      expect(typeof server).to.equal('function')

      server.call(seneca, { type: 'tcp' }, function (err, address) {
        expect(err).to.not.exist()

        settings.tcp.port = address.port
        var client = Tcp.client(settings, transportUtil)
        expect(typeof client).to.equal('function')
        client.call(seneca, { type: 'tcp' }, function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })
})
