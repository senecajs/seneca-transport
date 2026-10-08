# Write a transport plugin

Goal: carry Seneca messages over something other than HTTP or TCP (a
message queue, a pub/sub system, an in-process channel) while reusing
the envelope handling, call map and loop checks of this plugin. The
complete program is [memory-transport.js](../examples/memory-transport.js);
the helpers are specified in [Utilities](../reference/utils.md).

## 1. Decide the topics

Transports built on queues need a name for each destination. The
helpers derive *topics* from the pins: one per local pattern matched by
the listener's pins (`listen_topics`) and one per message on the client
(`resolve_topic`), with the same naming rule, so that both sides agree.
With `msgprefix: 'seneca_'` and the pin `role:color,cmd:*`, the pattern
`role:color,cmd:hex` becomes `seneca_cmd_hex_role_color_`. Without pins
the topic is `seneca_any`.

## 2. Register the hooks

A transport plugin adds two actions per type. The example uses
in-memory queues keyed by topic:

```js
const queues = {}

function memory() {
  const seneca = this
  const tu = seneca.export('transport/utils')

  seneca.add('role:transport,hook:listen,type:memory', function (config, reply) {
    const listener = this.root.delegate()

    // One topic per local pattern matched by the pins (or 'seneca_any').
    const topics = tu.listen_topics(listener, config, config)

    topics.forEach(function (topic) {
      queues[topic + '_act'] = function (envelope) {
        tu.handle_request(listener, envelope, config, function (response) {
          queues[topic + '_res'](response)
        })
      }
    })

    tu.close(listener, function (done) { done() })
    reply()
  })

  seneca.add('role:transport,hook:client,type:memory', function (config, reply) {
    const sender = this.root.delegate()

    tu.make_client(
      sender,
      function make_send(spec, topic, send_done) {
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

    tu.close(sender, function (done) { done() })
  })
}
```

The pattern is always the same:

* Listener: for each topic, receive envelopes and pass them to
  `handle_request`; publish what it gives you (it may give `null` or a
  response with `sync: false`, which need not be sent). Use a delegate
  of the root instance (`this.root.delegate()`), since `handle_request`
  sets the transaction id on it.
* Client: hand `make_client` a `make_send` function that, for a topic,
  subscribes to the responses (passing them to `handle_response`) and
  returns a `send(msg, done, meta)` function that builds the envelope
  with `prepare_request` (with `this`, the acting instance) and publishes
  it.
* Both: register a close hook with `tu.close` to release connections.
* Reply to the listen hook when listening (any value), and let
  `make_client` reply to the client hook with the client object.

`config` is the configuration from `listen`/`client`, resolved by the
core; it carries your own keys too (`dest`, `url`, credentials) and,
for clients, an `id`, which `make_client` requires.

## 3. Use it

```js
const service = Seneca({ tag: 'service', log: 'warn' })
  .use('@seneca/transport')
  .use(memory)
  .add('role:color,cmd:hex', function (msg, reply) {
    reply({ name: msg.name, hex: '#FF0000' })
  })
  .listen({ type: 'memory', pin: 'role:color,cmd:*' })

service.ready(function () {
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use('@seneca/transport')
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
```

The example prints what passes through:

```
$ node memory-transport.js
listening on topics [ 'seneca_cmd_hex_role_color_' ]
client sends topic seneca_cmd_hex_role_color_ for pin {"role":"color","cmd":"*"}
listener received {"id":"0fci7uy42i6c/4sydzpirf78y","kind":"act","origin":"7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client","track":["7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client"],"time":{"client_sent":1791442428618},"act":{"role":"color","cmd":"hex","name":"red","custom$":{}},"sync":true,"msg$":{"vin":1,"sid":"7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client","out":true,"mid":"0fci7uy42i6c","cid":"4sydzpirf78y","snc":true,"pat":"cmd:*,role:color"}}
listener replies {"id":"0fci7uy42i6c/4sydzpirf78y","kind":"res","origin":"7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client","accept":"nk28nhl8gqyq/1791442428358/10446/4.0.0-rc5/service","track":["7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client"],"time":{"client_sent":1791442428618,"listen_recv":1791442428619,"listen_sent":1791442428619},"sync":true,"res":{"name":"red","hex":"#FF0000"}}
result { name: 'red', hex: '#FF0000' }
memory client closed
memory listener closed
```

Add the actions before `listen()`: `listen_topics` only finds patterns
that already exist. The plugin must be loaded on both sides, and this
plugin (`@seneca/transport`) must be loaded before yours so that the
export exists.

## 4. Things to get right

* Serialize envelopes with `tu.stringifyJSON(seneca, note, obj)` and
  parse with `tu.parseJSON(seneca, note, str)`; they log instead of
  throwing, and `parseJSON` returns an `Error` you can turn into an
  `invalid_json` response with `tu.error('invalid_json', { input })`.
* Deliver responses to the instance that sent the request:
  `handle_response` drops responses whose `origin` is not its own id.
* Keep the plugin's options available to your transport if you need
  them: `seneca.options().plugin.transport` holds what was passed to
  `use`; the merged values with defaults are in
  `seneca.export('transport').meta.options`.
* Do not relay an inbound message object through another client (see
  [Loop detection and its limits](../explanation/message-lifecycle.md#6-loop-detection-and-its-limits)).

The core side of transports (how `client()` adds actions, `local$`,
`override`, fatal errors) is in the Seneca
[Transport reference](https://github.com/senecajs/seneca/blob/master/docs/reference/transport.md#for-transport-plugin-authors).
