/* A client of the color service over HTTP. Run: node http-client.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

const seneca = Seneca({ tag: 'client', log: 'warn' })
  .use(Transport)
  .client({ type: 'web', port: 8270, pin: 'role:color,cmd:*' })

seneca.ready(async function () {
  try {
    console.log(await seneca.post('role:color,cmd:list'))
    console.log(await seneca.post('role:color,cmd:hex,name:plum'))
  } catch (err) {
    console.error('ERROR', err.message)
    process.exitCode = 1
  } finally {
    await seneca.close()
  }
})
