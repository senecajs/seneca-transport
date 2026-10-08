/* Call a TCP listener without Seneca: one ndjson request, one ndjson response.
   Run: node raw-tcp-client.js */
'use strict'

const Net = require('net')
const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')
const color = require('./color')

const service = Seneca({ tag: 'service', log: 'warn' })
  .use(Transport)
  .use(color)
  .listen({ type: 'tcp', port: 8272, pin: 'role:color,cmd:*' })

service.ready(function () {
  const socket = Net.connect(8272, '127.0.0.1', function () {
    const request = {
      id: 'request-1/transaction-1',
      kind: 'act',
      origin: 'raw-tcp-client',
      track: [],
      time: { client_sent: Date.now() },
      act: { role: 'color', cmd: 'hex', name: 'blue' },
      sync: true,
    }
    socket.write(JSON.stringify(request) + '\n')
  })

  // Responses are newline delimited: collect data until a full line arrives.
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', function (chunk) {
    buffer += chunk
    const end = buffer.indexOf('\n')
    if (-1 === end) return
    console.log(JSON.parse(buffer.slice(0, end)))
    socket.end()
    service.close()
  })

  socket.on('error', function (err) {
    console.error('ERROR', err.message)
    process.exitCode = 1
    service.close()
  })
})
