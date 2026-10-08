# Getting started

In this tutorial you run a small Seneca plugin as a service in one
process and call it from another, first over HTTP and then over TCP,
without changing the plugin. The finished programs are in
[docs/examples](../examples/).

You should know the basics of Seneca: `add`, `act`, plugins and
`ready`. The Seneca tutorial
[Getting started](https://github.com/senecajs/seneca/blob/master/docs/tutorials/getting-started.md)
covers them.

## 1. Install

```sh
npm install seneca @seneca/transport
```

Version 8.4.0 is the first one published as `@seneca/transport`; see
[Install](../../README.md#install) for the state of the npm package.

Seneca 4 does not contain network code; `listen` and `client` need a
transport plugin. (Seneca 3 loads its own copy of the plugin; see
[Run on Seneca 3 and Seneca 4](../how-to/run-on-seneca-3-and-4.md).)

The example files in this repository load the plugin with
`require('../..')` because they live inside it. In your own project
write `seneca.use('@seneca/transport')`, as the code on this page does.

## 2. The plugin

Save this as `color.js`. It maps color names to hex values and knows
two commands, `hex` and `list`:

```js
module.exports = function color(options) {
  const colors = { red: '#FF0000', green: '#00FF00', blue: '#0000FF', ...options.colors }

  this.add('role:color,cmd:hex', function (msg, reply) {
    const hex = colors[msg.name]
    if (null == hex) {
      return reply(this.error('unknown_color', { name: msg.name }))
    }
    reply({ name: msg.name, hex })
  })

  this.add('role:color,cmd:list', function (msg, reply) {
    reply({ names: Object.keys(colors) })
  })
}

// Error codes and message templates for this.error and this.fail.
module.exports.errors = {
  unknown_color: 'Unknown color: <%=name%>.',
}
```

Nothing in it mentions the network.

## 3. A service and a client in one process

Save this as `one-process.js`:

```js
const Seneca = require('seneca')
const color = require('./color')

// The service: loads the plugin and listens for role:color messages.
const service = Seneca({ tag: 'service', log: 'warn' })
  .use('@seneca/transport')
  .use(color)
  .listen({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

service.ready(function () {
  // The client: sends role:color messages to the service.
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use('@seneca/transport')
    .client({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

  client.ready(async function () {
    try {
      console.log(await client.post('role:color,cmd:list'))
      console.log(await client.post('role:color,cmd:hex,name:red'))
    } catch (err) {
      console.error('ERROR', err.message)
      process.exitCode = 1
    } finally {
      // Closing releases the listening socket, so the process exits.
      await client.close()
      await service.close()
    }
  })
})
```

Run it:

```
$ node one-process.js
{ names: [ 'red', 'green', 'blue' ] }
{ name: 'red', hex: '#FF0000' }
```

What happened:

* `service.listen({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })`
  started an HTTP server on port 8274. The `pin` documents which
  messages the service is meant to serve.
* `client.client({ ... pin: 'role:color,cmd:*' })` added an action for
  the pin on the client instance. The action's job is to send matching
  messages to the service and wait for the reply. `client.post` is
  called exactly as it would be for a local action.
* The service ran the `color` actions and sent the results back. The
  message identifiers and the transaction identifier are the same on
  both sides, so logs on the two instances can be matched.
* `close()` on each instance, in `finally` so that it also runs when a
  call fails, ran the transport's close hooks, which released the
  socket. With nothing left open, the process exited.

On Node.js 24 the first HTTP request also prints a `DEP0169`
deprecation warning about `url.parse()`; it is harmless.

## 4. Two processes over HTTP

Now split the program. The service, `http-service.js`:

```js
const Seneca = require('seneca')
const color = require('./color')

const seneca = Seneca({
  tag: 'color',
  log: 'warn',
  // Close the instance (and release the port) on SIGTERM and SIGINT.
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use('@seneca/transport')
  .use(color, { colors: { plum: '#8E4585' } })

seneca.listen({ type: 'web', port: 8270, pin: 'role:color,cmd:*' }, function (err, out) {
  if (err) {
    console.error('ERROR', err.message)
    return seneca.close()
  }
  console.log('color service listening on port ' + out.port + ' as ' + seneca.id)
})
```

The callback passed to `listen` is called once the server is up, with
the configuration it used (`out.port` is the real port, which matters
when you listen on port `0`). If the server cannot start (for example
because the port stays in use), Seneca treats it as fatal: it logs a
`transport_listen` error, closes the instance and exits with code 1.
Start the service in one terminal:

```
$ node http-service.js
color service listening on port 8270 as us1i90uwlny0/1791442553218/11713/4.0.0-rc5/color
```

The client, `http-client.js`, in a second terminal:

```js
const Seneca = require('seneca')

const seneca = Seneca({ tag: 'client', log: 'warn' })
  .use('@seneca/transport')
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
```

```
$ node http-client.js
{ names: [ 'red', 'green', 'blue', 'plum' ] }
{ name: 'plum', hex: '#8E4585' }
```

Without the service running, the client logs the failed call as a JSON
error entry, prints
`ERROR Client request error: connect ECONNREFUSED 127.0.0.1:8270` and
exits with code 1.

The service does not need a Seneca client at all. Any HTTP client can
post a JSON message to the listen path, `/act`:

```
$ curl -s -X POST http://127.0.0.1:8270/act -H 'Content-Type: application/json' \
    -d '{"role":"color","cmd":"hex","name":"plum"}'
{"name":"plum","hex":"#8E4585"}
```

Stop the service with Ctrl-C. The `close_signals` option makes Seneca
close the instance first, so the port is released and the process
exits with code 0.

## 5. The same over TCP

Change `type: 'web'` to `type: 'tcp'` on both sides and use another
port. The service, `tcp-service.js`:

```js
seneca.listen({ type: 'tcp', port: 8271, pin: 'role:color,cmd:*' }, function (err, out) {
  if (err) {
    console.error('ERROR', err.message)
    return seneca.close()
  }
  console.log('color service listening on tcp port ' + out.port + ' as ' + seneca.id)
})
```

The client, `tcp-client.js`:

```js
const seneca = Seneca({ tag: 'client', log: 'warn' })
  .use('@seneca/transport')
  .client({ type: 'tcp', port: 8271, pin: 'role:color,cmd:*' })
```

```
$ node tcp-service.js
color service listening on tcp port 8271 as 5j2vgvjqddl4/1791442554105/11737/4.0.0-rc5/color
```

```
$ node tcp-client.js
{ names: [ 'red', 'green', 'blue', 'plum' ] }
{ name: 'plum', hex: '#8E4585' }
```

Over TCP the client keeps one connection open and reconnects if the
service restarts; each message and each reply is one line of JSON. Over
HTTP each message is one POST request. The plugin code and the client
code are identical; only the configuration changed.

One difference shows when the service is down: the TCP client keeps
trying to connect, so its call fails only when the Seneca action
timeout expires (`action_timeout` after 22222 ms by default) instead of
at once.

## 6. What to read next

* [Choose and configure a transport type](../how-to/choose-and-configure-a-transport-type.md):
  `web`, `tcp`, the aliases, and where configuration values come from.
* [Pass errors between services](../how-to/pass-errors-between-services.md):
  what the `unknown_color` error looks like on the client.
* [Shut down cleanly](../how-to/shut-down-cleanly.md): `close`, signals
  and ports.
* [How a message travels](../explanation/message-lifecycle.md): the
  envelope, the identifiers and the checks on the way.
* The Seneca how-to guide
  [Use network transports](https://github.com/senecajs/seneca/blob/master/docs/how-to/use-network-transports.md)
  covers pins, several services, local overrides and `local$`.
