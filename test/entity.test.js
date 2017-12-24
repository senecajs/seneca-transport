'use strict'

var Assert = require('assert')
var Lab = require('lab')
var Entity = require('seneca-entity')
var CreateInstance = require('./utils/createInstance')

var lab = (exports.lab = Lab.script())
var describe = lab.describe
var it = lab.it

describe('Transporting Entities', function() {
  it('uses correct tx$ properties on entity actions for "transported" entities', function(done) {
    var seneca1 = CreateInstance()

    if (seneca1.version >= '2.0.0') {
      seneca1.use(Entity)
    }

    seneca1.ready(function() {
      seneca1
        .add({ cmd: 'test' }, function(args, cb) {
          args.entity.save$(function(err, entitySaveResponse) {
            if (err) return cb(err)

            this.act({ cmd: 'test2' }, function(err, test2Result) {
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
        .add({ role: 'entity', cmd: 'save' }, function(args, cb) {
          cb(null, { entity: args.ent, tx: args.tx$ })
        })
        .add({ cmd: 'test2' }, function(args, cb) {
          cb(null, { tx: args.tx$ })
        })
        .listen({ type: 'tcp', port: 20103 })

      var seneca2 = CreateInstance()

      if (seneca2.version >= '2.0.0') {
        seneca2.use(Entity)
      }

      seneca2.ready(function() {
        seneca2.client({ type: 'tcp', port: 20103 })
        this.act(
          { cmd: 'test', entity: this.make$('test').data$({ name: 'bar' }) },
          function(err, res) {
            Assert(!err)

            Assert(res.entity.name === 'bar')
            Assert(res.txBeforeEntityAction === res.txInsideEntityAction)
            Assert(res.txBeforeEntityAction === res.txAfterEntityAction)
            done()
          }
        )
      })
    })
  })

  it('uses correct tx$ properties on entity actions for "non-transported" requests', function(done) {
    CreateInstance()
      .add({ cmd: 'test' }, function(args, cb) {
        this.act({ cmd: 'test2' }, function(err, test2Result) {
          if (err) {
            return cb(err)
          }

          cb(null, {
            txBeforeEntityAction: args.tx$,
            txAfterEntityAction: test2Result.tx
          })
        })
      })
      .add({ cmd: 'test2' }, function(args, cb) {
        cb(null, { tx: args.tx$ })
      })
      .listen({ type: 'tcp', port: 20104 })
      .ready(function() {
        CreateInstance()
          .client({ type: 'tcp', port: 20104 })
          .ready(function() {
            this.act({ cmd: 'test' }, function(err, res) {
              Assert(!err)
              Assert(res.txBeforeEntityAction === res.txAfterEntityAction)
              done()
            })
          })
      })
  })
})
