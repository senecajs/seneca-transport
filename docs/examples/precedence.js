/* Which setting wins? Starts TCP listeners configured in different places and
   prints the port and timeout each one ends up with. Run: node precedence.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

// [description, Seneca options, plugin options, listen configuration]
const cases = [
  ['plugin option tcp.port', {}, { tcp: { port: 23201 } }, {}],
  ['core section transport.tcp.port', { transport: { tcp: { port: 23202 } } }, {}, {}],
  ['core top level transport.port', { transport: { port: 23203 } }, {}, {}],
  ['listen port, with all of the above', { transport: { port: 23203, tcp: { port: 23202 } } }, { tcp: { port: 23201 } }, { port: 23204 }],
  ['plugin option tcp.timeout', {}, { tcp: { timeout: 1111 } }, { port: 23205 }],
  ['core section transport.tcp.timeout, plugin option set', { transport: { tcp: { timeout: 2222 } } }, { tcp: { timeout: 1111 } }, { port: 23206 }],
  ['core top level transport.timeout, section set', { transport: { timeout: 3333, tcp: { timeout: 2222 } } }, {}, { port: 23207 }],
  ['listen timeout, with all of the above', { transport: { timeout: 3333, tcp: { timeout: 2222 } } }, { tcp: { timeout: 1111 } }, { port: 23208, timeout: 4444 }],
]

async function main() {
  for (const [name, senecaOptions, pluginOptions, config] of cases) {
    const seneca = Seneca(Object.assign({ log: 'warn' }, senecaOptions)).use(Transport, pluginOptions)
    try {
      const out = await new Promise((resolve) =>
        seneca.listen(Object.assign({ type: 'tcp' }, config), (err, out) => resolve(out)),
      )
      console.log(name + ': port ' + out.port + ', timeout ' + out.timeout)
    } finally {
      await seneca.close()
    }
  }
}

main().catch((err) => {
  console.error('ERROR', err.message)
  process.exitCode = 1
})
