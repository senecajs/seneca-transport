/* A callback style client.
   Run: node portable-client.js [web|tcp], with http-service.js or tcp-service.js running. */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

const type = process.argv[2] || 'web'
const port = 'tcp' === type ? 8271 : 8270

const seneca = Seneca({
  tag: 'client',
  log: 'warn',
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
