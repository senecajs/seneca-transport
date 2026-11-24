/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */
'use strict'

// A listen/client round trip whose remote action fails. On Seneca 4 the
// caller receives the remote error unwrapped: its own code, details and
// message, not a wrapper such as act_execute with the original error under
// err.orig. The published seneca-transport 8.3.0 cannot do this on
// Seneca 4, because it tries to serialise the error's meta$.

var Util = require('util')
var Assert = require('assert')
var Lab = require('@hapi/lab')

var CreateInstance = require('./utils/createInstance')

var lab = (exports.lab = Lab.script())
var describe = lab.describe
var it = make_it(lab)

var TYPES = [
  { type: 'web', port: 30441 },
  { type: 'tcp', port: 40441 },
]

describe('remote errors', function () {
  TYPES.forEach(function (spec) {
    it('remote-error-unwrapped-' + spec.type, function (fin) {
      var listener = CreateInstance()
        .add('a:1', function (msg, reply) {
          var err = new Error('bad wire: ' + msg.x)
          err.code = 'bad_wire'
          err.details = { x: msg.x, list: [1, 2] }
          reply(err)
        })
        .listen({ type: spec.type, port: spec.port })

      listener.ready(function () {
        var client = CreateInstance().client({
          type: spec.type,
          port: spec.port,
        })

        client.act('a:1,x:2', function (err, out) {
          try {
            Assert(err instanceof Error)
            Assert.equal(err.code, 'bad_wire')
            Assert.equal(err.message, 'bad wire: 2')
            Assert.equal(err.name, 'Error')
            Assert.equal(err.details.x, 2)
            Assert.deepEqual(err.details.list, [1, 2])
            Assert.equal(err.orig, undefined)
            Assert.equal(err.code === 'act_execute', false)
            Assert(!out)
          } catch (e) {
            return fin(e)
          }

          client.close(function () {
            listener.close(fin)
          })
        })
      })
    })

    it('remote-fail-unwrapped-' + spec.type, function (fin) {
      var listener = CreateInstance()
        .add('b:1', function (msg, reply) {
          reply(this.fail('remote_failure', { y: msg.y }))
        })
        .listen({ type: spec.type, port: spec.port + 1 })

      listener.ready(function () {
        var client = CreateInstance().client({
          type: spec.type,
          port: spec.port + 1,
        })

        client.act('b:1,y:3', function (err, out) {
          try {
            Assert(err instanceof Error)
            Assert.equal(err.code, 'remote_failure')
            Assert.equal(err.details.y, 3)
            Assert.equal(err.orig, undefined)
            Assert(!out)
          } catch (e) {
            return fin(e)
          }

          client.close(function () {
            listener.close(fin)
          })
        })
      })
    })
  })
})

function make_it(lab) {
  return function it(name, opts, func) {
    if ('function' === typeof opts) {
      func = opts
      opts = {}
    }

    lab.it(
      name,
      opts,
      Util.promisify(function (x, fin) {
        func(fin)
      }),
    )
  }
}
