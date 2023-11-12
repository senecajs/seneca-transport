/* Copyright (c) 2018-2023 Richard Rodger and other contributors, MIT License */
'use strict'


import Seneca from 'seneca'


const tmx = parseInt(process.env.TIMEOUT_MULTIPLIER || '1', 10)


// TODO: test top level qaz:* : def and undef other pats
describe('transport', () => {

  test('happy', function(fin) {
    const s0 = Seneca({
      tag: 's0',
      close_delay: 0
    })
      .test()
      .error(fin)

    const c0 = Seneca({
      tag: 'c0',
      close_delay: 0
    })
      .test()
      .error(fin)

    s0.add('a:1', function a1(msg: any, reply: any, _meta: any) {
      reply({ x: msg.x })
    })
      .add('b:1', function a1(_msg: any, reply: any, _meta: any) {
        reply([1, 2, 3])
      })
      .listen(62010)
      .ready(function() {
        c0.client(62010)

        c0.act('a:1,x:2', function(_ignore: any, out: any, meta: any) {
          expect(out.x).toEqual(2)
          expect(out.meta$).toBeUndefined()

          expect(meta.pattern).toEqual('')
          expect(meta.trace[0].desc[0]).toEqual('a:1')
          c0.act('b:1', function(_ignore: any, out: any, _meta: any) {
            expect(out).toEqual([1, 2, 3])

            // s0.close(c0.close.bind(c0, fin))
            s0.close(() => {
              c0.close(() => {
                fin()
              })
            })
          })
        })
      })
  })


  test('config-legacy', function(fin) {
    var s0 = Seneca({ tag: 's0' }).test(fin)
    var c0 = Seneca({
      tag: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg: any, reply: any, _meta: any) {
      reply({ x: msg.x })
    })
      .listen({ id: 's0a', port: 62011, type: 'direct' })
      .listen({ id: 's0b', port: 62012, type: 'http' })
      .ready(function() {
        c0.client({ id: 'c0a', port: 62011, pin: 'x:1' })
          .client({ id: 'c0b', port: 62012, pin: 'x:2' })

          .act('a:1,x:1', function(_ignore: any, out: any) {
            expect(out.x).toEqual(1)
          })
          .act('a:1,x:2', function(_ignore: any, out: any) {
            expect(out.x).toEqual(2)
          })
          .ready(function() {
            s0.close(c0.close.bind(c0, fin))
          })
      })
  })


  test('error', function(fin) {
    var s0 = Seneca({
      tag: 's0'
    })
      .test()
      .quiet()

    var c0 = Seneca({
      tag: 'c0',
    })
      .test()
      .quiet()

    s0.add('a:1', function a1(_msg: any, reply: any, _meta: any) {
      reply(new Error('bad'))
    })
      .listen(62011)
      .ready(function() {
        c0.client(62011)

        c0.act('a:1,x:2', function(err: any, out: any, meta: any) {
          expect(err).toBeDefined()
          expect(null == out).toEqual(true)
          expect(null == err.meta$).toEqual(true)

          expect(err.message).toEqual('bad')

          expect(meta.pattern).toEqual('')
          expect(meta.err.code).toEqual('act_execute')

          s0.close(c0.close.bind(c0, fin))
        })
      })
  })


  // TODO: test separately
  /*
  test('interop', function(fin) {
    var s0n = Seneca({
      id$: 's0n',
      log: 'silent',
      legacy: { transport: false },
    })
    var s0o = Seneca({ id$: 's0o', log: 'silent', legacy: { transport: true } })
    var c0n = Seneca({
      id$: 'c0n',
      log: 'silent',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    })
    var c0o = Seneca({
      id$: 'c0o',
      log: 'silent',
      timeout: 22222 * tmx,
      legacy: { transport: true },
    })

    //s0o.test('print')
    //c0n.test('print')
    //s0n.test('print')
    //c0o.test('print')

    s0n
      .add('a:1', function a1(msg: any, reply: any, _meta: any) {
        reply({ r: msg.x })
      })
      .listen(62012)

    s0o
      .add('a:1', function a1(msg: any, reply: any, _meta: any) {
        reply({ r: msg.x })
      })
      .listen(62013)

    s0n.ready(
      s0o.ready.bind(s0o, function() {
        c0n.client(62013) // n -> o
        c0o.client(62012) // o -> n

        c0n.act('a:1,x:1', function(err: any, out: any, meta: any) {
          expect(err).toBeUndefined()
          expect(out.r).toEqual(1)
          expect(meta.pattern).toEqual('')

          c0o.act('a:1,x:2', function(err: any, out: any, meta: any) {
            expect(err).toBeUndefined()
            expect(out.r).toEqual(2)
            expect(meta.pattern).toEqual('')

            fin()
          })
        })
      }),
    )
  })
  */


  test('config', function(fin) {
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

    s0.add('a:1', function(msg: any, reply: any) {
      reply({ x: msg.x })
    })
      .add('b:1', function(msg: any, reply: any, meta: any) {
        expect(msg.x.canon$()).toEqual('-/-/foo')
        expect(meta.pattern).toEqual('b:1')
        msg.x.g = 2
        reply({ x: msg.x })
      })
      .listen()
      .ready(function() {
        expect(s0.private$.transport.register.length).toEqual(1)

        c0.client().ready(function() {
          expect(c0.private$.transport.register.length).toEqual(1)

          c0.act('a:1,x:2', function(_ignore: any, _out: any) {
            do_entity()
          })
        })
      })

    function do_entity() {
      c0.act(
        'b:1',
        { x: c0.make$('foo', { f: 1 }) },
        function(_ignore: any, out: any, meta: any) {
          expect(out.x.f).toEqual(1)
          expect(out.x.g).toEqual(2)
          expect(out.x.canon$()).toEqual('-/-/foo')
          expect(meta.pattern).toEqual('')

          s0.close(c0.close.bind(c0, fin))
        },
      )
    }
  })


  test('transport-local-override', function(fin) {
    var s0 = Seneca({
      tag: 's0',
      timeout: 22222 * tmx,
      transport: { web: { port: 62020 } },
      legacy: { transport: false },
    })
      .test(fin)
      .add('foo:1', function foo_srv(_msg: any, reply: any, _meta: any) {
        reply({ bar: 1 })
      })
      .listen({ pin: 'foo:1' })
      .ready(function() {
        var c0 = Seneca({
          tag: 'c0',
          timeout: 22222 * tmx,
          transport: { web: { port: 62020 } },
          legacy: { transport: false },
        })
          .test(fin)
          .add('foo:1', function foo_cln(_msg: any, reply: any, _meta: any) {
            reply({ bar: 2 })
          })
          .client({ pin: 'foo:1' })
          .act('foo:1,actid$:aa/BB', function(err: any, out: any) {
            expect(null == err).toEqual(true)

            // The remote version overrides the local version
            expect(out.bar).toEqual(1)

            // console.dir(this.find('foo:1'), { depth: null })

            s0.close(c0.close.bind(c0, fin))
          })
      })
  })

  test('meta', function(fin) {
    var s0 = Seneca({ tag: 's0' }).test(fin)
    var c0 = Seneca({
      tag: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(msg: any, reply: any, meta: any) {
      expect(meta.remote).toEqual(1 === msg.r)

      // remote is not propogated - top level only
      if ('b' === msg.from) {
        expect(meta.remote).toEqual(false)
      }

      reply({ x: msg.x, y: meta.custom.y })
    })
      .add('b:1', function a1(msg: any, reply: any, meta: any) {
        expect(meta.remote).toEqual(1 === msg.r)
        this.act('a:1', { x: msg.x, from: 'b' }, reply)
      })
      .listen(62010)
      .ready(function() {
        c0.client(62010).act(
          'a:1,x:2,r:1',
          { meta$: { custom: { y: 33 } } },
          function(_ignore: any, out: any, _meta: any) {
            expect(out.y).toEqual(33)
            expect(out.x).toEqual(2)

            this.act(
              'b:1,x:3,r:1',
              { meta$: { custom: { y: 44 } } },
              function(_ignore: any, out: any, _meta: any) {
                expect(out.y).toEqual(44)
                expect(out.x).toEqual(3)

                s0.close(c0.close.bind(c0, fin))
              },
            )
          },
        )
      })
  })

  test('ordering', function(fin) {
    var s0 = Seneca({ tag: 's0' }).test(fin)
    var c0 = Seneca({
      tag: 'c0',
      timeout: 22222 * tmx,
      legacy: { transport: false },
    }).test(fin)

    s0.add('a:1', function a1(_msg: any, reply: any, _meta: any) {
      reply({ x: 'a' })
    })
      .add('a:1,b:1', function a1(_msg: any, reply: any, _meta: any) {
        reply({ x: 'ab' })
      })
      .add('c:1', function a1(_msg: any, reply: any, _meta: any) {
        reply({ x: 'c' })
      })
      .add('c:1,d:1', function a1(_msg: any, reply: any, _meta: any) {
        reply({ x: 'cd' })
      })
      .listen(62010)
      .ready(function() {
        var i = 0
        c0.client({ port: 62010, pin: 'a:1' })
          .client({ port: 62010, pin: 'a:1,b:1' })
          .client({ port: 62010, pin: 'c:1,d:1' })
          .client({ port: 62010, pin: 'c:1' })
          .act('a:1', function(_ignore: any, out: any) {
            expect(out).toEqual({ x: 'a' })
            i++
          })
          .act('c:1', function(_ignore: any, out: any) {
            expect(out).toEqual({ x: 'c' })
            i++
          })
          .act('a:1,b:1', function(_ignore: any, out: any) {
            expect(out).toEqual({ x: 'ab' })
            i++
          })
          .act('c:1,d:1', function(_ignore: any, out: any) {
            expect(out).toEqual({ x: 'cd' })
            i++
          })
          .ready(function() {
            expect(i).toEqual(4)
            s0.close(c0.close.bind(c0, fin))
          })
      })
  })

  // TEST: parent and trace over transport - fake and network
  // TEST: separate reply - write TCP



  // Thanks to https://github.com/davide-talesco for this test
  // https://github.com/senecajs/seneca-transport/issues/165
  test('multi-layer-error', function(fin) {
    const s1 = Seneca({ tag: 's1' }).quiet()
    const s2 = Seneca({ tag: 's2' }).quiet()
    const s3 = Seneca({ tag: 's3' }).quiet()

    s1.client({ port: 40402, pin: 'cmd:test2' })
      .add('cmd:test1', function(_msg: any, reply: any) {
        this.act('cmd:test2', reply)
      })
      .listen(40401)

    s2.client({ port: 40403, pin: 'cmd:test3' })
      .add('cmd:test2', function(_msg: any, reply: any) {
        this.act('cmd:test3', reply)
      })
      .listen(40402)

    s3.add('cmd:test3', function(_msg: any, _reply: any) {
      throw new Error('from-test3')
    }).listen(40403)

    s1.ready(
      s2.ready.bind(
        s2,
        s3.ready.bind(s3, function() {
          s1.act('cmd:test1', function(err) {
            expect(err.message).toEqual('from-test3')
            s1.close(s2.close.bind(s2, s3.close.bind(s3, fin)))
          })
        }),
      ),
    )
  })

})
