/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'

var Code = require('code')
var Lab = require('lab')
var Seneca = require('seneca')
var Http = require('../lib/http')
var TransportUtil = require('../lib/transport-utils')


// Test shortcuts

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect


describe('http', function () {
  describe('listen()', function () {
    it('can listen on ephemeral port', function (done) {
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        web: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var http = Http.listen(settings, transportUtil)
      expect(typeof http).to.equal('function')

      http.call(seneca, { type: 'web' }, function (err) {
        expect(err).to.not.exist()
        done()
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
        web: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var server = Http.listen(settings, transportUtil)
      expect(typeof server).to.equal('function')

      server.call(seneca, { type: 'web' }, function (err, address) {
        expect(err).to.not.exist()

        settings.web.port = address.port
        var client = Http.client(settings, transportUtil)
        expect(typeof client).to.equal('function')
        client.call(seneca, { type: 'web' }, function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })
})
