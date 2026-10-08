/* List the requests a client is waiting for: role:transport,cmd:inflight. Run: node inflight.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

const service = Seneca({ tag: 'service', log: 'warn' })
  .use(Transport)
  .add('role:slow,cmd:run', function (msg, reply) {
    setTimeout(() => reply({ slept: msg.ms }), msg.ms)
  })
  .listen({ type: 'web', port: 8279, pin: 'role:slow,cmd:*' })

service.ready(function () {
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use(Transport)
    .client({ type: 'web', port: 8279, pin: 'role:slow,cmd:*' })

  client.ready(async function () {
    try {
      const pending = client.post('role:slow,cmd:run,ms:300')

      // While the call is in flight, ask the transport what it is waiting for.
      console.log(await client.post('role:transport,cmd:inflight'))

      console.log(await pending)
      console.log(await client.post('role:transport,cmd:inflight'))
    } catch (err) {
      console.error('ERROR', err.message)
      process.exitCode = 1
    } finally {
      await client.close()
      await service.close()
    }
  })
})
