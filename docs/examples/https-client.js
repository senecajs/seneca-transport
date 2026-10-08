/* A client of the color service over HTTPS. Run: node https-client.js
   With a self-signed certificate: NODE_EXTRA_CA_CERTS=certs/cert.pem node https-client.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

const seneca = Seneca({ tag: 'client', log: 'warn', timeout: 5000 })
  .use(Transport)
  .client({ type: 'web', port: 8273, host: '127.0.0.1', protocol: 'https', pin: 'role:color,cmd:*' })

seneca.ready(async function () {
  try {
    console.log(await seneca.post('role:color,cmd:hex,name:green'))
  } catch (err) {
    console.log('ERROR', err.code, err.message)
    process.exitCode = 1
  } finally {
    await seneca.close()
  }
})
