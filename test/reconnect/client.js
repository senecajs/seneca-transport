'use strict'

var Code = require('code')
var Seneca = require('seneca')
var Transport = require('../../')

var expect = Code.expect
var client = Seneca({ log: 'silent', default_plugins: { transport: false } })
client.use(Transport)

process.on('message', function (address) {
  if (!address.port) {
    return
  }

  client.ready(function () {
    client.client({ type: 'tcp', port: address.port, host: '127.0.0.1' })
    client.act({ foo: 'bar' }, function (err, message) {
      expect(err).to.not.exist()
      expect(message.result).to.equal('bar')
      process.send({ acted: true })
    })
  })
})
