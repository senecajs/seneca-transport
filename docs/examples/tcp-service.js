/* The color service over TCP. Run: node tcp-service.js (stop with Ctrl-C) */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

const seneca = Seneca({
  tag: 'color',
  log: 'warn',
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use(Transport)
  .use(color, { colors: { plum: '#8E4585' } })

seneca.listen({ type: 'tcp', port: 8271, pin: 'role:color,cmd:*' }, function (err, out) {
  if (err) {
    console.error('ERROR', err.message)
    return seneca.close()
  }
  console.log('color service listening on tcp port ' + out.port + ' as ' + seneca.id)
})
