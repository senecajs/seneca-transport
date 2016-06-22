'use strict'

var Assert = require('assert')
var CreateInstance = require('./createInstance')

function createClient (type, port, done, tag) {
  CreateInstance()
    .client({type: type, port: port})
    .ready(function () {
      this.act('c:1,d:A', function (err, out) {
        if (err) return done(err)

        Assert.equal('{"s":"1-A"}', JSON.stringify(out))

        this.act('c:1,d:AA', function (err, out) {
          if (err) return done(err)

          Assert.equal('{"s":"1-AA"}', JSON.stringify(out))

          this.close(done)
        })
      })
    })
}

module.exports = createClient
