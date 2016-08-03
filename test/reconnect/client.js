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
  process.stdout.write('client is setting up ' + JSON.stringify(address, null, 2) + '\n')
  client.ready(function () {
    client.client({type: 'tcp', port: address.port})
    client.act({ foo: 'bar' }, function (err, message) {
      expect(err).to.not.exist()
      expect(message.result).to.equal('bar')
      process.send({ acted: true })
    })
  })
})
