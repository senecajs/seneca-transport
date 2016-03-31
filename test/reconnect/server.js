'use strict'

var Seneca = require('seneca')
var Transport = require('../../')

var server = Seneca({ log: 'silent', default_plugins: { transport: false } })
server.use(Transport)
server.add({ foo: 'bar' }, function (message, cb) {
  cb(null, { result: 'bar' })
})
server.ready(function () {
  server.listen({ type: 'tcp', port: +process.argv[2] || 0, host: '127.0.0.1' }, function (err, address) {
    process.send({ port: address.port })
  })
})
