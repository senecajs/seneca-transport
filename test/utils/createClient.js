'use strict'

var Assert = require('assert')
var Transport = require('../../')
var Entity = require('seneca-entity')
var CreateInstance = require('./createInstance')

var assert = Assert

function createClient (type, port, done, tag) {
  CreateInstance(tag, [Entity, Transport])
    .client({type: type, port: port})
    .ready(function () {
      this.act('c:1,d:A', function (err, out) {
        if (err) return done(err)

        assert.equal('{"s":"1-A"}', JSON.stringify(out))

        this.act('c:1,d:AA', function (err, out) {
          if (err) return done(err)

          assert.equal('{"s":"1-AA"}', JSON.stringify(out))

          this.close(done)
        })
      })
    })
}

module.exports = createClient
