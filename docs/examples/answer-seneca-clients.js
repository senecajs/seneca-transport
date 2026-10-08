/* How a Seneca web client reacts to responses from a plain HTTP server
   (not a Seneca listener). Run: node answer-seneca-clients.js */
'use strict'

const Http = require('http')
const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

// Each mode is one way of answering; the client calls the server once per mode.
const modes = {
  // A result, echoing the identifying request headers: accepted.
  'result, headers echoed': { status: 200, echo: true, body: { ok: true } },
  // A result without the echoed headers: dropped, so the call times out.
  'result, no headers': { status: 200, echo: false, body: { ok: true } },
  // An error marked as a Seneca response: delivered as the remote error.
  'error, seneca-kind: res': {
    status: 500,
    echo: true,
    kind: true,
    body: { message: 'remote says no', code: 'no' },
  },
  // An error without the mark, as a proxy would send: fails at once.
  'error, not marked': { status: 502, echo: false, body: { message: 'Bad Gateway' } },
}
let mode

const server = Http.createServer(function (req, res) {
  req.resume()
  req.on('end', function () {
    const answer = modes[mode]
    const headers = { 'Content-Type': 'application/json' }
    if (answer.echo) {
      headers['seneca-id'] = req.headers['seneca-id']
      headers['seneca-origin'] = req.headers['seneca-origin']
    }
    if (answer.kind) {
      headers['seneca-kind'] = 'res'
    }
    res.writeHead(answer.status, headers)
    res.end(JSON.stringify(answer.body))
  })
})

server.listen(8278, '127.0.0.1', function () {
  // timeout: 1500 keeps the dropped response case short; log: 'fatal'
  // hides the log entries written for the failed calls.
  const client = Seneca({ tag: 'client', log: 'fatal', timeout: 1500 })
    .use(Transport)
    .client({ type: 'web', port: 8278, pin: 'role:remote,cmd:*' })

  client.ready(async function () {
    try {
      for (mode of Object.keys(modes)) {
        const start = Date.now()
        try {
          const out = await client.post('role:remote,cmd:run')
          console.log(mode + ': result', out, 'after', Date.now() - start, 'ms')
        } catch (err) {
          console.log(mode + ': error after', Date.now() - start, 'ms')
          console.log('  message:', JSON.stringify(err.message.split(' Timeout was')[0]), '| code:', err.code)
        }
      }
    } finally {
      await client.close()
      server.close()
    }
  })
})
