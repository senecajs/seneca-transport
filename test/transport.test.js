/* Copyright (c) 2022 Richard Rodger and other contributors, MIT License */
'use strict'


const Util = require('util')

const Code = require('@hapi/code')
const Lab = require('@hapi/lab')

// Test shortcuts
var lab = (exports.lab = Lab.script())
var describe = lab.describe
var expect = Code.expect

var it = make_it(lab)

var Seneca = require('seneca')

var tmx = parseInt(process.env.TIMEOUT_MULTIPLIER || 1, 10)


const Transport = require('../transport')


var test_opts = { parallel: false, timeout: 5555 * tmx }

describe('transport-v4', function () {
  // TODO: test top level qaz:* : def and undef other pats

  it('happy-nextgen', test_opts, function (fin) {
    var s0 = Seneca({ id$: 's0'}).test(fin).use(Transport)
    var c0 = Seneca({
      id$: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg, reply, meta) {
      reply({ x: msg.x })
    })
      .add('b:1', function a1(msg, reply, meta) {
        reply([1, 2, 3])
      })
      .listen(62010)
      .ready(function () {
        c0.client(62010)

        c0.act('a:1,x:2', function (ignore, out, meta) {
          expect(out.x).equals(2)
          expect(out.meta$).not.exist()

          expect(meta.pattern).equals('')
          expect(meta.trace[0].desc[0]).equals('a:1')
          c0.act('b:1', function (ignore, out, meta) {
            expect(out).equals([1, 2, 3])

            s0.close(c0.close.bind(c0, fin))
          })
        })
      })
  })

  it('config-legacy-nextgen', test_opts, function (fin) {
    var s0 = Seneca({ id$: 's0', legacy: { transport: false } }).test(fin)
    var c0 = Seneca({
      id$: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg, reply, meta) {
      reply({ x: msg.x })
    })
      .listen({ id: 's0a', port: 62011, type: 'direct' })
      .listen({ id: 's0b', port: 62012, type: 'http' })
      .ready(function () {
        c0.client({ id: 'c0a', port: 62011, pin: 'x:1' })
          .client({ id: 'c0b', port: 62012, pin: 'x:2' })

          .act('a:1,x:1', function (ignore, out) {
            expect(out.x).equals(1)
          })
          .act('a:1,x:2', function (ignore, out) {
            expect(out.x).equals(2)
          })
          .ready(function () {
            s0.close(c0.close.bind(c0, fin))
          })
      })
  })

  it('error-nextgen', test_opts, function (fin) {
    var s0 = Seneca({ id$: 's0', log: 'silent', legacy: { transport: false } })
    var c0 = Seneca({
      id$: 'c0',
      log: 'silent',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    })

    s0.add('a:1', function a1(msg, reply, meta) {
      reply(new Error('bad'))
    })
      .listen(62011)
      .ready(function () {
        c0.client(62011)

        c0.act('a:1,x:2', function (err, out, meta) {
          expect(err).exist()
          expect(out).not.exist()
          expect(err.meta$).not.exist()

          expect(err.message).equal('bad')

          expect(meta.pattern).equals('')
          expect(meta.err.code).equals('act_execute')

          s0.close(c0.close.bind(c0, fin))
        })
      })
  })


  it('config-nextgen', test_opts, function (fin) {
    var s0 = Seneca({
      tag: 's0',
      legacy: { transport: false },
      transport: { web: { port: 62020 } },
    })
      .test(fin)
      .use('entity')

    var c0 = Seneca({
      tag: 'c0',
      timeout: 22222 * tmx,
      transport: { web: { port: 62020 } },
      legacy: { transport: false },
    })
      .test(fin)
      .use('entity')

    s0.add('a:1', function (msg, reply) {
      reply({ x: msg.x })
    })
      .add('b:1', function (msg, reply, meta) {
        expect(msg.x.canon$()).equal('-/-/foo')
        expect(meta.pattern).equal('b:1')
        msg.x.g = 2
        reply({ x: msg.x })
      })
      .listen()
      .ready(function () {
        expect(s0.private$.transport.register.length).equal(1)

        c0.client().ready(function () {
          expect(c0.private$.transport.register.length).equal(1)

          c0.act('a:1,x:2', function (ignore, out) {
            do_entity()
          })
        })
      })

    function do_entity() {
      c0.act(
        'b:1',
        { x: c0.make$('foo', { f: 1 }) },
        function (ignore, out, meta) {
          expect(out.x.f).equals(1)
          expect(out.x.g).equals(2)
          expect(out.x.canon$()).equal('-/-/foo')
          expect(meta.pattern).equal('')

          s0.close(c0.close.bind(c0, fin))
        }
      )
    }
  })

  it('nextgen-transport-local-override', test_opts, function (fin) {
    var s0 = Seneca({
      tag: 's0',
      timeout: 22222 * tmx,
      transport: { web: { port: 62020 } },
      legacy: { transport: false },
    })
      .test(fin)
      .add('foo:1', function foo_srv(msg, reply, meta) {
        reply({ bar: 1 })
      })
      .listen({ pin: 'foo:1' })
      .ready(function () {
        var c0 = Seneca({
          tag: 'c0',
          timeout: 22222 * tmx,
          transport: { web: { port: 62020 } },
          legacy: { transport: false },
        })
          .test(fin)
          .add('foo:1', function foo_cln(msg, reply, meta) {
            reply({ bar: 2 })
          })
          .client({ pin: 'foo:1' })
          .act('foo:1,actid$:aa/BB', function (err, out) {
            expect(err).to.not.exist()

            // The remote version overrides the local version
            expect(out.bar).to.equal(1)

            // console.dir(this.find('foo:1'), { depth: null })

            s0.close(c0.close.bind(c0, fin))
          })
      })
  })

  it('nextgen-meta', test_opts, function (fin) {
    var s0 = Seneca({ id$: 's0', legacy: { transport: false } }).test(fin)
    var c0 = Seneca({
      id$: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg, reply, meta) {
      expect(meta.remote).equal(1 === msg.r)

      // remote is not propogated - top level only
      if ('b' === msg.from) {
        expect(meta.remote).false()
      }

      reply({ x: msg.x, y: meta.custom.y })
    })
      .add('b:1', function a1(msg, reply, meta) {
        expect(meta.remote).equal(1 === msg.r)
        this.act('a:1', { x: msg.x, from: 'b' }, reply)
      })
      .listen(62010)
      .ready(function () {
        c0.client(62010).act(
          'a:1,x:2,r:1',
          { meta$: { custom: { y: 33 } } },
          function (ignore, out, meta) {
            expect(out.y).equals(33)
            expect(out.x).equals(2)

            this.act(
              'b:1,x:3,r:1',
              { meta$: { custom: { y: 44 } } },
              function (ignore, out, meta) {
                expect(out.y).equals(44)
                expect(out.x).equals(3)

                s0.close(c0.close.bind(c0, fin))
              }
            )
          }
        )
      })
  })

  it('nextgen-ordering', test_opts, function (fin) {
    var s0 = Seneca({ id$: 's0', legacy: { transport: false } }).test(fin)
    var c0 = Seneca({
      id$: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg, reply, meta) {
      reply({ x: 'a' })
    })
      .add('a:1,b:1', function a1(msg, reply, meta) {
        reply({ x: 'ab' })
      })
      .add('c:1', function a1(msg, reply, meta) {
        reply({ x: 'c' })
      })
      .add('c:1,d:1', function a1(msg, reply, meta) {
        reply({ x: 'cd' })
      })
      .listen(62010)
      .ready(function () {
        var i = 0
        c0.client({ port: 62010, pin: 'a:1' })
          .client({ port: 62010, pin: 'a:1,b:1' })
          .client({ port: 62010, pin: 'c:1,d:1' })
          .client({ port: 62010, pin: 'c:1' })
          .act('a:1', function (ignore, out) {
            expect(out).equal({ x: 'a' })
            i++
          })
          .act('c:1', function (ignore, out) {
            expect(out).equal({ x: 'c' })
            i++
          })
          .act('a:1,b:1', function (ignore, out) {
            expect(out).equal({ x: 'ab' })
            i++
          })
          .act('c:1,d:1', function (ignore, out) {
            expect(out).equal({ x: 'cd' })
            i++
          })
          .ready(function () {
            expect(i).equal(4)
            s0.close(c0.close.bind(c0, fin))
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
      'AsyncFunction' === func.constructor.name
        ? func
        : Util.promisify(function (x, fin) {
          func(fin)
        })
    )
  }
}
