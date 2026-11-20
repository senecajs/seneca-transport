/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */
'use strict'

var Util = require('util')
var Assert = require('assert')
var Lab = require('@hapi/lab')
var TransportUtil = require('../lib/transport-utils')

var CreateInstance = require('./utils/createInstance')

var lab = (exports.lab = Lab.script())
var describe = lab.describe
var it = make_it(lab)

var CORE_HELPERS = [
  'externalize_msg',
  'externalize_reply',
  'internalize_msg',
  'internalize_reply',
  'info',
]

function makeUtil(seneca) {
  return new TransportUtil({
    callmap: new Map(),
    seneca: seneca,
    options: {
      msgprefix: 'seneca_',
      warn: {},
      check: {},
    },
  })
}

describe('transport/utils export', function () {
  it('keeps-core-helpers', function (fin) {
    var seneca = CreateInstance()

    seneca.ready(function () {
      var tu = seneca.export('transport/utils')

      try {
        // This plugin's helpers.
        Assert.equal(typeof tu.make_client, 'function')
        Assert.equal(typeof tu.handle_request, 'function')
        Assert.equal(typeof tu.listen_topics, 'function')

        // The Seneca 4 core helpers that other transports use.
        CORE_HELPERS.forEach(function (name) {
          Assert.equal(typeof tu[name], 'function', name)
        })

        // Core round trip of a message and a reply.
        var msg = tu.externalize_msg(seneca, { a: 1 }, { id: 'm0/t0' })
        var inmsg = tu.internalize_msg(seneca, JSON.parse(JSON.stringify(msg)))
        Assert.equal(inmsg.a, 1)
        Assert.equal(inmsg.id$, 'm0/t0')

        var rep = tu.externalize_reply(seneca, null, { b: 2 }, { id: 'm0/t0' })
        var inrep = tu.internalize_reply(
          seneca,
          JSON.parse(JSON.stringify(rep)),
        )
        Assert.equal(inrep.err, null)
        Assert.equal(inrep.out.b, 2)

        // Both forms of the JSON helpers.
        Assert.equal(tu.stringifyJSON({ c: 3 }), '{"c":3}')
        Assert.deepEqual(tu.parseJSON('{"c":3}'), { c: 3 })
        Assert.equal(tu.stringifyJSON(seneca, 'note', { c: 3 }), '{"c":3}')
        Assert.deepEqual(tu.parseJSON(seneca, 'note', '{"c":3}'), { c: 3 })
        Assert(tu.parseJSON(seneca, 'note', '{') instanceof Error)
        Assert(tu.parseJSON('{') instanceof Error)
      } catch (e) {
        return fin(e)
      }

      seneca.close(fin)
    })
  })

  it('adopt-core-utils', function (fin) {
    var tu = makeUtil({})
    var core = {
      internalize_msg: function () {
        return 'core'
      },
      make_client: function () {
        return 'core'
      },
      stringifyJSON: function (obj) {
        return 'core:' + JSON.stringify(obj)
      },
      parseJSON: function () {
        return 'core'
      },
      flag: true,
    }

    tu.adopt_core_utils(null)
    tu.adopt_core_utils(function () {})
    tu.adopt_core_utils(tu)
    Assert.equal(tu.internalize_msg, undefined)
    Assert.equal(tu.stringifyJSON({ d: 4 }), undefined)

    tu.adopt_core_utils(core)
    Assert.equal(tu.internalize_msg(), 'core')
    Assert.notEqual(tu.make_client, core.make_client)
    Assert.equal(tu.flag, undefined)
    Assert.equal(tu.stringifyJSON({ d: 4 }), 'core:{"d":4}')
    Assert.equal(tu.parseJSON('{}'), 'core')
    Assert.equal(tu.stringifyJSON(null, 'note', { d: 4 }), '{"d":4}')
    fin()
  })
})

describe('fixed message properties', function () {
  function request() {
    return {
      id: 'mmm/ttt',
      kind: 'act',
      origin: 'remote',
      track: [],
      time: { client_sent: 0 },
      act: { a: 1 },
    }
  }

  function fakeSeneca(props) {
    var acts = []
    var seneca = Object.assign(
      {
        id: 'local',
        log: { warn: function () {}, error: function () {} },
        act: function (msg, reply) {
          acts.push(msg)
          reply(null, { ok: true })
        },
      },
      props,
    )
    seneca.acts = acts
    return seneca
  }

  it('reads-fixedmsg', function (fin) {
    // Seneca 4.0.0: fixedmsg, with fixedargs as a deprecated alias that
    // must not be read.
    var fixedmsg = {}
    var seneca = fakeSeneca({ fixedmsg: fixedmsg })
    Object.defineProperty(seneca, 'fixedargs', {
      get: function () {
        throw new Error('fixedargs was read')
      },
    })

    makeUtil(seneca).handle_request(seneca, request(), {}, function (out) {
      try {
        Assert.equal(fixedmsg.tx$, 'ttt')
        Assert.deepEqual(out.res, { ok: true })
      } catch (e) {
        return fin(e)
      }
      fin()
    })
  })

  it('falls-back-to-fixedargs', function (fin) {
    // A core without fixedmsg.
    var fixedargs = {}
    var seneca = fakeSeneca({ fixedargs: fixedargs })

    makeUtil(seneca).handle_request(seneca, request(), {}, function (out) {
      try {
        Assert.equal(fixedargs.tx$, 'ttt')
        Assert.deepEqual(out.res, { ok: true })
      } catch (e) {
        return fin(e)
      }
      fin()
    })
  })

  it('transaction-id-on-seneca-4', function (fin) {
    var seneca = CreateInstance()
    seneca.ready(function () {
      var delegate = seneca.root.delegate()
      var tu = seneca.export('transport/utils')
      var fixed = delegate.fixedmsg ?? delegate.fixedargs

      delegate.add('a:1', function (msg, reply) {
        reply(null, { tx: msg.tx$ })
      })

      tu.handle_request(delegate, request(), {}, function (out) {
        try {
          Assert.equal(fixed.tx$, 'ttt')
          Assert.equal(out.res.tx, 'ttt')
        } catch (e) {
          return fin(e)
        }
        seneca.close(fin)
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
