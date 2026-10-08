/* The color service over HTTP. Run: node http-service.js (stop with Ctrl-C) */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

const seneca = Seneca({
  tag: 'color',
  log: 'warn',
  // Close the instance (and release the port) on SIGTERM and SIGINT.
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use(Transport)
  .use(color, { colors: { plum: '#8E4585' } })

seneca.listen({ type: 'web', port: 8270, pin: 'role:color,cmd:*' }, function (err, out) {
  if (err) {
    console.error('ERROR', err.message)
    return seneca.close()
  }
  console.log('color service listening on port ' + out.port + ' as ' + seneca.id)
})
