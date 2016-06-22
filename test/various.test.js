'use strict'

var Assert = require('assert')
var Lab = require('lab')
var Seneca = require('seneca')
var Transport = require('../')
var Entity = require('seneca-entity')

var assert = Assert
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it

var no_t = {transport: false}

var CreateInstance = require('./utils/createInstance')

process.setMaxListeners(999)

describe('Various misc', function () {
  it('uses correct tx$ properties on entity actions for "transported" entities', function (done) {
    var seneca1 = CreateInstance(null, [Transport, Entity])
    .ready(function () {
      seneca1.add({cmd: 'test'}, function (args, cb) {
        args.entity.save$(function (err, entitySaveResponse) {
          if (err) return cb(err)

          this.act({cmd: 'test2'}, function (err, test2Result) {
            if (err) {
              return cb(err)
            }

            cb(null, {
              entity: entitySaveResponse.entity,
              txBeforeEntityAction: args.tx$,
              txInsideEntityAction: entitySaveResponse.tx,
              txAfterEntityAction: test2Result.tx
            })
          })
        })
      })
      .add({role: 'entity', cmd: 'save'}, function (args, cb) {
        cb(null, { entity: args.ent, tx: args.tx$ })
      })
      .add({cmd: 'test2'}, function (args, cb) {
        cb(null, { tx: args.tx$ })
      })
      .listen({type: 'tcp', port: 20103})

      var seneca2 = CreateInstance(null, [Entity, Transport])
      .ready(function () {
        seneca2.client({type: 'tcp', port: 20103})
        this.act({cmd: 'test', entity: this.make$('test').data$({name: 'bar'})}, function (err, res) {
          assert(!err)

          assert(res.entity.name === 'bar')
          assert(res.txBeforeEntityAction === res.txInsideEntityAction)
          assert(res.txBeforeEntityAction === res.txAfterEntityAction)
          done()
        })
      })
    })
  })


  it('uses correct tx$ properties on entity actions for "non-transported" requests', function (done) {
    CreateInstance()
      .use(Entity)
      .use(Transport)
      .add({ cmd: 'test' }, function (args, cb) {
        this.act({ cmd: 'test2' }, function (err, test2Result) {
          if (err) {
            return cb(err)
          }

          cb(null, { txBeforeEntityAction: args.tx$, txAfterEntityAction: test2Result.tx })
        })
      })
      .add({ cmd: 'test2' }, function (args, cb) {
        cb(null, { tx: args.tx$ })
      })
      .listen({ type: 'tcp', port: 20104 })
      .ready(function () {
        CreateInstance()
          .use(Entity)
          .use(Transport)
          .client({ type: 'tcp', port: 20104 })
          .ready(function () {
            this.act({ cmd: 'test' }, function (err, res) {
              assert(!err)
              assert(res.txBeforeEntityAction === res.txAfterEntityAction)
              done()
            })
          })
      })
  })

  // NOTE: SENECA_LOG=all will break this test as it counts log entries
  it('own-message', function (fin) {
    // a -> b -> a

    do_type('tcp', function (err) {
      if (err) {
        return fin(err)
      }
      do_type('http', fin)
    })

    function do_type (type, fin) {
      function counter_a (args, done) {
        counters.a++
        done(null, {aa: args.a})
      }
      function counter_b (args, done) {
        counters.b++
        done(null, {bb: args.b})
      }

      var counters = {log_a: 0, log_b: 0, own: 0, a: 0, b: 0, c: 0}

      var log_a = function () {
        counters.log_a++
      }
      var log_b = function () {
        counters.log_b++
      }
      var own_a = function () {
        counters.own++
      }


      var a = Seneca({
        log: {map: [
          {level: 'debug', regex: /\{a:1\}/, handler: log_a},
          {level: 'warn', regex: /own_message/, handler: own_a}
        ]},
        timeout: 111,
        default_plugins: no_t
      })
            .use('../transport.js', {
              check: {message_loop: false},
              warn: {own_message: true}
            })
            .add('a:1', counter_a)
            .listen({type: type, port: 40405})
            .client({type: type, port: 40406})

      var b = Seneca({
        log: {map: [
          {level: 'debug', regex: /\{b:1\}/, handler: log_b}
        ]},
        timeout: 111,
        default_plugins: no_t
      })
            .use('../transport.js')
            .add('b:1', counter_b)
            .listen({type: type, port: 40406})
            .client({type: type, port: 40405})


      a.ready(function () {
        b.ready(function () {
          a.act('a:1', function (err, out) {
            if (err) {
              return fin(err)
            }
            assert.equal(1, out.aa)
          })

          a.act('b:1', function (err, out) {
            if (err) {
              return fin(err)
            }
            assert.equal(1, out.bb)
          })

          a.act('c:1', function (err, out) {
            if (!err) {
              assert.fail()
            }
            assert.ok(err.timeout)
          })
        })
      })

      setTimeout(function () {
        a.close(function (err) {
          if (err) {
            return fin(err)
          }

          b.close(function (err) {
            if (err) {
              return fin(err)
            }

            try {
              assert.equal(1, counters.a)
              assert.equal(1, counters.b)
              assert.equal(1, counters.log_a)
              assert.equal(1, counters.log_b)
              assert.equal(1, counters.own)
            }
            catch (e) {
              return fin(e)
            }

            fin()
          })
        })
      }, 222)
    }
  })


  // NOTE: SENECA_LOG=all will break this test as it counts log entries
  it('message-loop', function (fin) {
    // a -> b -> c -> a

    do_type('tcp', function (err) {
      if (err) {
        return fin(err)
      }
      do_type('http', fin)
    })

    function do_type (type, fin) {
      function counter_a (args, done) {
        counters.a++
        done(null, {aa: args.a})
      }
      function counter_b (args, done) {
        counters.b++
        done(null, {bb: args.b})
      }
      function counter_c (args, done) {
        counters.c++
        done(null, {cc: args.c})
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

      var a = Seneca({
        log: {map: [
          {level: 'debug', regex: /\{a:1\}/, handler: log_a},
          {level: 'warn', regex: /message_loop/, handler: loop_a}
        ]},
        timeout: 111,
        default_plugins: no_t
      })
            .use('../transport.js', {
              check: {own_message: false},
              warn: {message_loop: true}
            })
            .add('a:1', counter_a)
            .listen({type: type, port: 40405})
            .client({type: type, port: 40406})

      var b = Seneca({
        log: {map: [
          {level: 'debug', regex: /\{b:1\}/, handler: log_b}
        ]},
        timeout: 111,
        default_plugins: no_t
      })
            .use('../transport.js')
            .add('b:1', counter_b)
            .listen({type: type, port: 40406})
            .client({type: type, port: 40407})

      var c = Seneca({
        log: {map: [
          {level: 'debug', regex: /\{c:1\}/, handler: log_c}
        ]},
        timeout: 111,
        default_plugins: no_t
      })
            .use('../transport.js')
            .add('c:1', counter_c)
            .listen({type: type, port: 40407})
            .client({type: type, port: 40405})


      a.ready(function () {
        b.ready(function () {
          c.ready(function () {
            a.act('a:1', function (err, out) {
              if (err) {
                return fin(err)
              }
              assert.equal(1, out.aa)
            })

            a.act('b:1', function (err, out) {
              if (err) {
                return fin(err)
              }
              assert.equal(1, out.bb)
            })

            a.act('c:1', function (err, out) {
              if (err) {
                return fin(err)
              }
              assert.equal(1, out.cc)
            })

            a.act('d:1', function (err) {
              if (!err) {
                assert.fail()
              }
              assert.ok(err.timeout)
            })
          })
        })
      })

      setTimeout(function () {
        a.close(function (err) {
          if (err) {
            return fin(err)
          }

          b.close(function (err) {
            if (err) {
              return fin(err)
            }

            c.close(function (err) {
              if (err) {
                return fin(err)
              }

              try {
                assert.equal(1, counters.a)
                assert.equal(1, counters.b)
                assert.equal(1, counters.c)
                assert.equal(1, counters.log_a)
                assert.equal(1, counters.log_b)
                assert.equal(1, counters.log_c)
                assert.equal(1, counters.loop)
              }
              catch (e) {
                return fin(e)
              }
              fin()
            })
          })
        })
      }, 222)
    }
  })


  it('testmem-topic-star', function (fin) {
    Seneca({tag: 'srv', timeout: 5555, log: 'silent', debug: {short_logs: true}})
      .use(Transport)
      .use('./stubs/memtest-transport.js')
      .add('foo:1', function (args, done) {
        assert.equal('aaa/AAA', args.meta$.id)
        done(null, {bar: 1})
      })
      .add('foo:2', function (args, done) {
        assert.equal('bbb/BBB', args.meta$.id)
        done(null, {bar: 2})
      })
      .listen({type: 'memtest', pin: 'foo:*'})
      .ready(function () {
        Seneca({tag: 'cln', timeout: 5555, log: 'silent', debug: {short_logs: true}})

          .use(Transport)
          .use('./stubs/memtest-transport.js')

          .client({type: 'memtest', pin: 'foo:*'})

          .start(fin)

          .wait('foo:1,id$:aaa/AAA')
          .step(function (out) {
            assert.equal(1, out.bar)
            return true
          })

          .wait('foo:2,id$:bbb/BBB')
          .step(function (out) {
            assert.equal(2, out.bar)
            return true
          })

          .end()
      })
  })


  it('catchall-ordering', function (fin) {
    Seneca({tag: 'srv', timeout: 5555, log: 'silent', debug: {short_logs: true}})
      .use(Transport)
      .use('./stubs/memtest-transport.js')

      .add('foo:1', function (args, done) {
        done(null, {FOO: 1})
      })

      .add('bar:1', function (args, done) {
        done(null, {BAR: 1})
      })

      .listen({type: 'memtest', dest: 'D0', pin: 'foo:*'})
      .listen({type: 'memtest', dest: 'D1'})

      .ready(function () {
        do_catchall_first()

        function do_catchall_first () {
          Seneca({tag: 'cln0', timeout: 5555, log: 'silent', debug: {short_logs: true}})

            .use(Transport)
            .use('./stubs/memtest-transport.js')

            .client({type: 'memtest', dest: 'D1'})
            .client({type: 'memtest', dest: 'D0', pin: 'foo:*'})

            .start(fin)

            .wait('foo:1')
            .step(function (out) {
              assert.equal(1, out.FOO)
              return true
            })

            .wait('bar:1')
            .step(function (out) {
              assert.equal(1, out.BAR)
              return true
            })

            .end(do_catchall_last)
        }

        function do_catchall_last (err) {
          if (err) {
            return fin(err)
          }

          Seneca({tag: 'cln1', timeout: 5555, log: 'silent', debug: {short_logs: true}})

            .use(Transport)
            .use('./stubs/memtest-transport.js')

            .client({type: 'memtest', dest: 'D0', pin: 'foo:*'})
            .client({type: 'memtest', dest: 'D1'})

            .start(fin)

            .wait('foo:1')
            .step(function (out) {
              assert.equal(1, out.FOO)
              return true
            })

            .wait('bar:1')
            .step(function (out) {
              assert.equal(1, out.BAR)
              return true
            })

            .end()
        }
      })
  })
})
