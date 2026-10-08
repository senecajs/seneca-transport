# Choose and configure a transport type

Goal: pick between HTTP and TCP, name the type correctly, and know where
each configuration value comes from.

## 1. Choose a type

| Type | Use when |
| ---- | -------- |
| `web` | You want HTTP or HTTPS: one POST per message, works through proxies and load balancers, can be called with `curl` or any HTTP client, easy to inspect. The default. |
| `tcp` | You want one persistent connection per client with automatic reconnect and less overhead per message, and all callers are Seneca instances (or speak the ndjson envelope). |

`http` and `direct` are aliases of `web`; they use the `web` options.
The types `pubsub` and `queue` belong to other plugins and fail with
`plugin-needed`.

## 2. Configure the service and the client

```js
// service
seneca.listen({ type: 'web', port: 8270, pin: 'role:color,cmd:*' })
// client
seneca.client({ type: 'web', port: 8270, host: 'color.internal', pin: 'role:color,cmd:*' })
```

Shorthand forms: `listen(8270)`, `listen(8270, '0.0.0.0')`,
`listen(8270, '0.0.0.0', '/act')`, and the same for `client`. Without
a `type` the type is `web`.

Switching to TCP is a configuration change on both sides:

```js
seneca.listen({ type: 'tcp', port: 8271, pin: 'role:color,cmd:*' })
seneca.client({ type: 'tcp', port: 8271, host: 'color.internal', pin: 'role:color,cmd:*' })
```

The TCP client connects when `client()` is called and reconnects by
itself; the HTTP client connects per message.

## 3. Set defaults for every call

Plugin options apply to every `listen` and `client` of the instance:

```js
seneca.use('@seneca/transport', {
  web: { timeout: 10000, max_listen_attempts: 50 },
  tcp: { max_listen_attempts: 10, attempt_delay: 200 },
})
```

or, equivalently, in the instance options:

```js
Seneca({ plugin: { transport: { web: { timeout: 10000 } } } })
```

Seneca core's shared `transport` block feeds every call as well. Its top
level values apply to every type; a section named after the type
applies to that type:

```js
Seneca({
  transport: {
    port: 9000,                 // every listen and client without a port
    web: { timeout: 10000 },    // web only
  },
})
```

Precedence, highest first: the call's own configuration, the core's top
level `transport` values, the core section `transport.<type>`, the
plugin option, the plugin default. Three consequences:

* The core always supplies `transport.port` (10101), so the port comes
  from the call or from the top level `transport.port` only; `web.port`
  and `tcp.port` (plugin options or core sections) never take effect.
* A top level `transport.path` reaches TCP listeners too, which then
  listen on a UNIX domain socket of that name. Keep HTTP paths per call
  or in a `web` section.
* On Seneca 4.0.0-rc5 the core also supplies `host`, `path` and
  `protocol` at the top level, so `web` and `tcp` sections cannot change
  them there; give them per call.

[precedence.js](../examples/precedence.js) shows the order with real
listeners; see
[How a configuration is resolved](../reference/options.md#how-a-configuration-is-resolved).

## 4. Compute values at call time

For the `web` type, `port`, `host` and `path` may be functions; they
are called with the configuration when the listener starts or the
client sends:

```js
seneca.listen({ type: 'web', port: () => Number(process.env.PORT) || 8270 })
```

The `tcp` type does not resolve functions.

## 5. Mind the Seneca 4.0.0-rc5 defaults

On the Seneca 4 prerelease the core's shared block contains
`host: '127.0.0.1'`, `path: '/act'` and `protocol: 'http'`, so a
listener without an explicit `host` binds `127.0.0.1` (not `0.0.0.0` as
on Seneca 3 and 4.0.0), and the plugin's `web.host`, `web.path` and
`web.protocol` options are overridden. Set these per call when the
service must run on 4.0.0-rc5. See
[Seneca 3 versus 4](../explanation/seneca-3-versus-4.md).

## 6. Check the result

The `listen` callback receives the configuration the hook was given,
with `port` (and for `web`, `host`) set to what was bound:

```js
seneca.listen({ type: 'web', port: 0 }, function (err, out) {
  console.log(out.port)   // the free port that was picked
})
```

Values the hook filled in from the plugin's defaults are not all
reported: a `web` listener on Seneca 3 or 4.0.0 reports `path:
undefined` and still serves `/act`.

`seneca.list('role:transport')` lists the hook patterns available, which
tells you whether the plugin is loaded.
