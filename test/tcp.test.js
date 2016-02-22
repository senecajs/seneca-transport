/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'

var Code = require('code')
var Lab = require('lab')
var Seneca = require('seneca')
var Tcp = require('../lib/tcp')
var TransportUtil = require('../lib/transport-utils')
var fs = require('fs');


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
          transort: false
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


    it('can listen on unix path', function (done) {
      var sock = '/tmp/seneca.sock'
      // Remove existing sock file
      if (fs.existsSync(sock)) {
        fs.unlinkSync(sock)
      }
      
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transort: false
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
  })
})
