'use strict'

var CreateInstance = require('../utils/createInstance')
var server = CreateInstance()

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
