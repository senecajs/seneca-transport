/* The color service over HTTPS. Run: node https-service.js <dir with key.pem and cert.pem> */
'use strict'

const Fs = require('fs')
const Path = require('path')
const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

// Read the key and certificate first: a missing file stops the program
// here, before any Seneca instance exists.
const dir = process.argv[2] || Path.join(__dirname, 'certs')
const serverOptions = {
  key: Fs.readFileSync(Path.join(dir, 'key.pem')),
  cert: Fs.readFileSync(Path.join(dir, 'cert.pem')),
}

const seneca = Seneca({
  tag: 'color',
  log: 'warn',
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use(Transport)
  .use(color)

seneca.listen(
  {
    type: 'web',
    port: 8273,
    host: '127.0.0.1',
    protocol: 'https',
    pin: 'role:color,cmd:*',
    serverOptions, // passed to https.createServer
  },
  function (err, out) {
    if (err) {
      console.error('ERROR', err.message)
      return seneca.close()
    }
    console.log('color service listening on https://127.0.0.1:' + out.port + '/act')
  },
)
