'use strict'

var Seneca = require('seneca')
var Transport = require('../../')
var server = Seneca({ log: 'silent', default_plugins: { transport: false } })
server.use(Transport)

server.add({foo: 'bar'}, function (message, cb) {
  cb(null, {result: 'bar'})
})

server.ready(function () {
  server.listen({type: 'tcp', port: 3507}, function (err, address) {
    if (err) {
      throw err
    }

    process.send({port: address.port})
  })
})
