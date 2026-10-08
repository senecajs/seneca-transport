/* A transport plugin built on the transport/utils export: messages travel
   through in-memory queues instead of a network. Run: node memory-transport.js */
'use strict'

const Seneca = require('seneca')
const Transport = require('../..') // in your project: require('@seneca/transport')

// One queue per topic, shared by every instance in this process.
const queues = {}

function memory() {
  const seneca = this
  const tu = seneca.export('transport/utils')

  seneca.add('role:transport,hook:listen,type:memory', function (config, reply) {
    const listener = this.root.delegate()

    // One topic per local pattern matched by the pins (or 'seneca_any').
    const topics = tu.listen_topics(listener, config, config)
    console.log('listening on topics', topics)

    topics.forEach(function (topic) {
      queues[topic + '_act'] = function (envelope) {
        console.log('listener received', JSON.stringify(envelope))
        tu.handle_request(listener, envelope, config, function (response) {
          console.log('listener replies', JSON.stringify(response))
          queues[topic + '_res'](response)
        })
      }
    })

    tu.close(listener, function (done) {
      console.log('memory listener closed')
      done()
    })

    reply()
  })

  seneca.add('role:transport,hook:client,type:memory', function (config, reply) {
    const sender = this.root.delegate()

    tu.make_client(
      sender,
      function make_send(spec, topic, send_done) {
        console.log('client sends topic', topic, 'for pin', JSON.stringify(spec.pin))
        queues[topic + '_res'] = function (response) {
          tu.handle_response(sender, response, config)
        }
        send_done(null, function send(msg, done, meta) {
          const envelope = tu.prepare_request(this, msg, done, meta)
          setImmediate(() => queues[topic + '_act'](envelope))
        })
      },
      config,
      reply,
    )

    tu.close(sender, function (done) {
      console.log('memory client closed')
      done()
    })
  })
}

const service = Seneca({ tag: 'service', log: 'warn' })
  .use(Transport)
  .use(memory)
  .add('role:color,cmd:hex', function (msg, reply) {
    reply({ name: msg.name, hex: '#FF0000' })
  })
  .listen({ type: 'memory', pin: 'role:color,cmd:*' })

service.ready(function () {
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use(Transport)
    .use(memory)
    .client({ type: 'memory', pin: 'role:color,cmd:*' })

  client.ready(async function () {
    try {
      console.log('result', await client.post('role:color,cmd:hex,name:red'))
    } catch (err) {
      console.error('ERROR', err.message)
      process.exitCode = 1
    } finally {
      await client.close()
      await service.close()
    }
  })
})
