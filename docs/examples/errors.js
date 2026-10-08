/* What an error replied by a remote action looks like on the client. Run: node errors.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

// log: 'fatal' hides the error log entries both instances write for each
// failed action, to keep the output short. Use 'warn' or the default to see them.
const service = Seneca({ tag: 'service', log: 'fatal' })
  .use(Transport)
  .use(color)
  .add('role:color,cmd:plain', function (msg, reply) {
    reply(new Error('a plain error'))
  })
  .add('role:color,cmd:detail', function (msg, reply) {
    const err = new Error('not found: ' + msg.name)
    err.code = 'not_found'
    err.statusCode = 404 // becomes the HTTP status of the response
    err.details = { name: msg.name, tried: ['red', 'green', 'blue'] }
    reply(err)
  })
  .add('role:color,cmd:throw', function () {
    throw new Error('thrown in the action')
  })
  .listen({ type: 'web', port: 8275, pin: 'role:color,cmd:*' })
  .listen({ type: 'tcp', port: 8276, pin: 'role:color,cmd:*' })

service.ready(function () {
  const client = Seneca({ tag: 'client', log: 'fatal' })
    .use(Transport)
    .client({ type: 'web', port: 8275, pin: 'role:color,cmd:hex' })
    .client({ type: 'web', port: 8275, pin: 'role:color,cmd:plain' })
    .client({ type: 'web', port: 8275, pin: 'role:color,cmd:detail' })
    .client({ type: 'tcp', port: 8276, pin: 'role:color,cmd:throw' })

  client.ready(async function () {
    try {
      for (const msg of [
        'role:color,cmd:hex,name:pink',
        'role:color,cmd:plain',
        'role:color,cmd:detail,name:pink',
        'role:color,cmd:throw',
      ]) {
        try {
          await client.post(msg)
          console.log(msg, 'unexpectedly succeeded')
        } catch (err) {
          console.log(msg)
          console.log('  message:', JSON.stringify(err.message))
          console.log('  code:', err.code, '| statusCode:', err.statusCode, '| name:', err.name)
          console.log('  details:', JSON.stringify(err.details))
          console.log('  properties:', Object.keys(err).join(', '))
        }
      }
    } finally {
      await client.close()
      await service.close()
    }
  })
})
