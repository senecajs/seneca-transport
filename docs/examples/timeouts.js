/* The three timeouts that apply to a remote call. Run: node timeouts.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

// An action that takes msg.ms milliseconds to reply.
function slow(msg, reply) {
  setTimeout(() => reply({ slept: msg.ms }), msg.ms)
}

async function run(name, port, clientOptions, clientConfig, ms) {
  // log: 'fatal' hides the error log entries written for the failed calls.
  const service = Seneca({ tag: 'service', log: 'fatal' })
    .use(Transport)
    .add('role:slow,cmd:run', slow)
    .listen({ type: 'web', port, pin: 'role:slow,cmd:*' })

  const client = Seneca(Object.assign({ tag: 'client', log: 'fatal' }, clientOptions))
    .use(Transport)
    .client(Object.assign({ type: 'web', port, pin: 'role:slow,cmd:*' }, clientConfig))

  try {
    await new Promise((resolve) => service.ready(resolve))
    await new Promise((resolve) => client.ready(resolve))

    const start = Date.now()
    try {
      const out = await client.post({ role: 'slow', cmd: 'run', ms })
      console.log(name + ': ok', out, 'after', Date.now() - start, 'ms')
    } catch (err) {
      console.log(name + ': error after', Date.now() - start, 'ms')
      console.log('  code:', err.code, '| message:', JSON.stringify(err.message.split(' Timeout was')[0]))
    }
  } finally {
    await client.close()
    await service.close()
  }
}

async function main() {
  await run('defaults, action takes 200 ms', 8277, {}, {}, 200)
  await run('seneca timeout 300 ms, action takes 1000 ms', 8277, { timeout: 300 }, {}, 1000)
  await run('client request timeout 300 ms, action takes 1000 ms', 8277, {}, { timeout: 300 }, 1000)
}

main().catch((err) => {
  console.error('ERROR', err.message)
  process.exitCode = 1
})
