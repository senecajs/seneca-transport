/* The color service with two extra actions, used by the HTTP protocol reference.
   Run: node protocol-service.js (stop with Ctrl-C), then call it with curl. */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

const seneca = Seneca({
  tag: 'protocol',
  log: 'warn',
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use(Transport)
  .use(color)

  // Replies after msg.ms milliseconds.
  .add('role:color,cmd:slow', function (msg, reply) {
    setTimeout(() => reply({ slept: msg.ms }), Number(msg.ms) || 0)
  })

  // Replies with an error that carries an HTTP status.
  .add('role:color,cmd:detail', function (msg, reply) {
    const err = new Error('not found: ' + msg.name)
    err.code = 'not_found'
    err.statusCode = 404
    err.details = { name: msg.name }
    reply(err)
  })

seneca.listen({ type: 'web', port: 8280, pin: 'role:color,cmd:*' }, function (err, out) {
  if (err) {
    console.error('ERROR', err.message)
    return seneca.close()
  }
  console.log('protocol service listening on port ' + out.port + ' as ' + seneca.id)
})
