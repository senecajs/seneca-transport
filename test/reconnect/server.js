'use strict'

var Seneca = require('seneca')
var Transport = require('../../')
var server = Seneca({ log: 'silent', default_plugins: { transport: false } })
server.use(Transport)

server.add({foo: 'bar'}, function (message, cb) {
  process.send({gotActCall: true})
  cb(null, {result: 'bar'})
})

server.ready(function () {
  server.listen({type: 'tcp', port: 9394}, function (err, address) {
    if (err) {
      throw err
    }

    process.stdout.write('server is listening\n')
    process.send({port: address.port})
  })
})
