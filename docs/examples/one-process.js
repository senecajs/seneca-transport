/* A service and a client over HTTP, in one process. Run: node one-process.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

// The service: loads the plugin and listens for role:color messages.
const service = Seneca({ tag: 'service', log: 'warn' })
  .use(Transport)
  .use(color)
  .listen({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

service.ready(function () {
  // The client: sends role:color messages to the service.
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use(Transport)
    .client({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

  client.ready(async function () {
    try {
      console.log(await client.post('role:color,cmd:list'))
      console.log(await client.post('role:color,cmd:hex,name:red'))
    } catch (err) {
      console.error('ERROR', err.message)
      process.exitCode = 1
    } finally {
      // Closing releases the listening socket, so the process exits.
      await client.close()
      await service.close()
    }
  })
})
