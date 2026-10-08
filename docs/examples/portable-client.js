/* A callback style client that runs on Seneca 3 and on Seneca 4.
   Run: node portable-client.js [web|tcp], with http-service.js or tcp-service.js running. */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

const type = process.argv[2] || 'web'
const port = 'tcp' === type ? 8271 : 8270

const seneca = Seneca({
  tag: 'client',
  log: 'warn',
  // Seneca 3 also loads the seneca-transport package it depends on;
  // this option leaves only the plugin loaded below. Seneca 4 ignores it.
  default_plugins: { transport: false },
})
  .use(Transport)
  .client({ type, port, pin: 'role:color,cmd:*' })

seneca.ready(function () {
  seneca.act('role:color,cmd:hex,name:plum', function (err, out) {
    if (err) return finish(err)
    console.log('Seneca ' + seneca.version + ' over ' + type + ':', out)

    // An expected failure: the service replies with an unknown_color error.
    seneca.act('role:color,cmd:hex,name:pink', function (err) {
      console.log('expected error:', err && err.code, '|', err && err.message)
      finish()
    })
  })
})

// Close the instance on every path, so that the process exits.
function finish(err) {
  if (err) {
    console.error('ERROR', err.message)
    process.exitCode = 1
  }
  seneca.close()
}
