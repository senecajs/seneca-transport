/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'

var Fs = require('fs')
var Code = require('code')
var Lab = require('lab')
var Seneca = require('seneca')
var Tcp = require('../lib/tcp')
var Transport = require('../transport')
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

  it('own-message tcp', { timeout: 3000, parallel: false }, function (done) {
    var type = 'tcp'

    var counters = { log_a: 0, log_b: 0, own: 0, a: 0, b: 0, c: 0 }

    // a -> b -> a
    function a (args, cb) {
      counters.a++
      cb(null, {aa: args.a})
    }
    function b (args, cb) {
      counters.b++
      cb(null, {bb: args.b})
    }

    var log_a = function () {
      counters.log_a++
    }
    var log_b = function () {
      counters.log_b++
    }
    var own_a = function () {
      counters.own++
    }

    var instanceA = Seneca({
      log: {map: [
        {level: 'debug', regex: /\{a:1\}/, handler: log_a},
        {level: 'warn', regex: /own_message/, handler: own_a}
      ]},
      timeout: 111,
      default_plugins: { transport: false }
    })

    var instanceB = Seneca({
      log: {map: [
        {level: 'debug', regex: /\{b:1\}/, handler: log_b}
      ]},
      timeout: 111,
      default_plugins: { transport: false }
    })

    instanceA.use(Transport, {
      check: {message_loop: false},
      warn: {own_message: true}
    })
    .add('a:1', a)

    instanceB.use(Transport)
    .add('b:1', b)

    instanceA.ready(function () {
      instanceB.ready(function () {
        instanceB.listen({type: type, host: '127.0.0.1', port: 0}, function (err, addressB) {
          expect(err).to.not.exist()

          instanceA.client({type: type, host: '127.0.0.1', port: addressB.port})

          instanceA.act('a:1', function (err, out) {
            expect(err).to.not.exist()
            expect(out.aa).to.equal(1)
            actB()
          })

          function actB () {
            instanceA.act('b:1', function (err, out) {
              expect(err).to.not.exist()
              expect(out.bb).to.equal(1)
              actC()
            })
          }

          function actC () {
            instanceA.act('c:1', function (err, out) {
              expect(err).to.exist()
              expect(err.code).to.equal('act_not_found')
              finish()
            })
          }

          function finish () {
            expect(err).to.not.exist()
            expect(counters.a).to.equal(1)
            expect(counters.b).to.equal(1)
            expect(counters.log_a).to.equal(1)
            expect(counters.log_b).to.equal(1)

            done()
          }
        })
      })
    })
  })

  it('message-loop tcp', { timeout: 3000, parallel: false }, function (done) {
    // a -> b -> c -> a
    var type = 'tcp'

    function a (args, cb) {
      counters.a++
      cb(null, {aa: args.a})
    }
    function b (args, cb) {
      counters.b++
      cb(null, {bb: args.b})
    }
    function c (args, cb) {
      counters.c++
      cb(null, {cc: args.c})
    }

    var counters = {log_a: 0, log_b: 0, log_c: 0, loop: 0, a: 0, b: 0, c: 0, d: 0}

    var log_a = function () {
      counters.log_a++
    }
    var log_b = function () {
      counters.log_b++
    }
    var log_c = function () {
      counters.log_c++
    }
    var loop_a = function () {
      counters.loop++
    }

    var instanceA = Seneca({
      log: {map: [
        {level: 'debug', regex: /\{a:1\}/, handler: log_a},
        {level: 'warn', regex: /message_loop/, handler: loop_a}
      ]},
      timeout: 111,
      default_plugins: { transport: false }
    })
    .use(Transport, {
      check: {own_message: false},
      warn: {message_loop: true}
    })
    .add('a:1', a)

    var instanceB = Seneca({
      log: {map: [
        {level: 'debug', regex: /\{b:1\}/, handler: log_b}
      ]},
      timeout: 111,
      default_plugins: { transport: false }
    })
    .use(Transport)
    .add('b:1', b)

    var instanceC = Seneca({
      log: {map: [
        {level: 'debug', regex: /\{c:1\}/, handler: log_c}
      ]},
      timeout: 111,
      default_plugins: { transport: false }
    })
    .use(Transport)
    .add('c:1', c)

    instanceA.listen({type: type, port: 0}, function (err, addressA) {
      expect(err).to.not.exist()
      instanceC.client({type: type, port: addressA.port})

      instanceB.listen({type: type, port: 0}, function (err, addressB) {
        expect(err).to.not.exist()
        instanceA.client({type: type, port: addressB.port})

        instanceC.listen({type: type, port: 0}, function (err, addressC) {
          expect(err).to.not.exist()
          instanceB.client({type: type, port: addressC.port})
          ready()
        })
      })
    })

    function ready () {
      instanceA.ready(function () {
        instanceB.ready(function () {
          instanceC.ready(function () {
            instanceA.act('a:1', function (err, out) {
              expect(err).to.not.exist()
              expect(out.aa).to.equal(1)
              actB()
            })

            function actB () {
              instanceA.act('b:1', function (err, out) {
                expect(err).to.not.exist()
                expect(out.bb).to.equal(1)
                actC()
              })
            }

            function actC () {
              instanceA.act('c:1', function (err, out) {
                expect(err).to.not.exist()
                expect(out.cc).to.equal(1)
                actD()
              })
            }

            function actD () {
              instanceA.act('d:1', function (err) {
                expect(err).to.exist()
                finish()
              })
            }
          })
        })
      })
    }

    function finish () {
      instanceA.close(function (err) {
        expect(err).to.not.exist()

        instanceB.close(function (err) {
          expect(err).to.not.exist()

          instanceC.close(function (err) {
            expect(err).to.not.exist()
            expect(counters.a).to.equal(1)
            expect(counters.b).to.equal(1)
            expect(counters.c).to.equal(1)
            expect(counters.log_a).to.equal(1)
            expect(counters.log_b).to.equal(1)
            expect(counters.log_c).to.equal(1)
            expect(counters.loop).to.equal(1)
            done()
          })
        })
      })
    }
  })
})
