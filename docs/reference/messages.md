# Messages reference

Every action pattern the plugin adds, with its parameters, reply and
errors. The patterns are added when the plugin is loaded
(`seneca.list('role:transport')` shows them). `seneca.listen()` and
`seneca.client()`, the API that calls them, is described in the core
[Transport reference](https://github.com/senecajs/seneca/blob/master/docs/reference/transport.md).

| Pattern | Called by | Reply |
| ------- | --------- | ----- |
| `role:transport,cmd:listen` | `seneca.listen()` | The listen hook's result. |
| `role:transport,cmd:client` | `seneca.client()` | The client object. |
| `role:transport,cmd:inflight` | you | Map of in-flight requests. |
| `role:transport,hook:listen,type:web` | `cmd:listen` | Listen configuration with the real port. |
| `role:transport,hook:listen,type:http` | `cmd:listen` | Alias of `web`. |
| `role:transport,hook:listen,type:direct` | `cmd:listen` | Alias of `web`. |
| `role:transport,hook:listen,type:tcp` | `cmd:listen` | Listen options with the real port. |
| `role:transport,hook:client,type:web` | `cmd:client` | Client object. |
| `role:transport,hook:client,type:http` | `cmd:client` | Alias of `web`. |
| `role:transport,hook:client,type:direct` | `cmd:client` | Alias of `web`. |
| `role:transport,hook:client,type:tcp` | `cmd:client` | Client object. |

The plugin also adds a prior on the close action for every listener and
client it creates: `sys:seneca,cmd:close` on Seneca 4,
`role:seneca,cmd:close` on Seneca 3.

## `role:transport,cmd:listen`

Called by `seneca.listen()` with `{ config }` (and `gate$: true`).

* Parameters: `config`, the resolved configuration (see
  [How a configuration is resolved](options.md#how-a-configuration-is-resolved)).
* Behaviour: when `config.type` is `pubsub` or `queue`, replies with a
  `plugin-needed` error naming `seneca-redis-transport` or
  `seneca-beanstalkd-transport`. Otherwise sends
  `role:transport,hook:listen,type:<type>` with the configuration as the
  message (plus `role` and `hook`) and replies with the hook's reply.
* Errors: the hook's error, or `plugin-needed`. The core turns any
  error into the fatal `transport_listen`; a hook that never replies
  surfaces as a fatal `action_timeout` after the Seneca `timeout`.
* Note: this action replaces the core's own `role:transport,cmd:listen`
  and does not call it, so the registration the core would record in
  `seneca.status().transport.register` is not made.

The callback given to `seneca.listen(config, callback)` receives
`(err, result)` where `result` is the hook's reply. `this` is not set in
that callback.

## `role:transport,cmd:client`

Called by `seneca.client()` with `{ config }`.

* Parameters: `config`, the resolved configuration; the core adds `id`
  (default: the canonical configuration) and `pg` (the canonical pins).
* Behaviour: as `cmd:listen`, for `role:transport,hook:client,type:<type>`.
* Reply: the client object made by `transport/utils`: `{ id, send(msg,
  reply, meta), toString() }`. `toString()` is `pin-<pins>-<id>` for a
  client with pins and `any-<id>` without.
* Errors: `plugin-needed` for `pubsub` and `queue`; the hook's error.
  The core turns an error into the fatal `transport_client` and an
  empty reply into the fatal `transport_client_null`.

## `role:transport,cmd:inflight`

Lists the requests this instance has sent and is waiting for (the call
map). No parameters. The reply is an object keyed by message id:

```js
{
  'm7hcyktllf35/c6g3ed32dlt5': {
    args: { role: 'slow', cmd: 'run', ms: 300 },   // the message
    done: [Function: bound bound action_reply],    // the waiting callback
    when: 1791442427217                            // when it was sent
  }
}
```

An empty object means nothing is in flight. See
[inflight.js](../examples/inflight.js).

## `role:transport,hook:listen,type:web` (`http`, `direct`)

Starts an HTTP or HTTPS server. The message is the configuration;
missing keys are filled from the plugin's `web` options.

| Key | Used for |
| --- | -------- |
| `port`, `host` | `server.listen(port, host)`. Functions are resolved with the configuration as argument. |
| `path` | Requests to any other path get `404` with an empty body. |
| `protocol`, `serverOptions` | `https.createServer(serverOptions)` when `protocol` is `https`, else `http.createServer()`. |
| `timeout` | Response timeout timer (not effective on Node.js 16 and later, see [HTTP protocol](http-protocol.md#timeouts)). |
| `max_listen_attempts`, `attempt_delay` | Retries after `EADDRINUSE`, each logged as a `listen attempt` warning that includes the full configuration. |

Reply: a copy of the message with `port` set to the port actually
bound. Errors: the server's error (for example `EADDRINUSE` once the
retries are used up); the core then dies with `transport_listen` and
the process exits with code 1.

The hook registers a close hook that closes the server.

## `role:transport,hook:listen,type:tcp`

Starts a TCP server speaking newline delimited JSON. Missing keys are
filled from the plugin's `tcp` options.

| Key | Used for |
| --- | -------- |
| `path` | A UNIX domain socket path (`server.listen(path)`); host and port are then ignored. When both this `path` and the core's shared `transport.path` are `/act` (the Seneca 4.0.0-rc5 default), the value is ignored and the plugin option `tcp.path` is used if set. See [The TCP `path`](options.md#the-tcp-path). |
| `port`, `host` | `server.listen(port, host)` otherwise. |
| `max_listen_attempts`, `attempt_delay` | Retries after `EADDRINUSE`; no retries by default. |

Reply: the merged options with `port` set to the port actually bound
(for a socket path, `port` is undefined). Errors: a listen error is
logged (`net-error`) and, without retries, the hook never replies; the
core then dies with a fatal `action_timeout` after the Seneca `timeout`
(22222 ms by default).

The hook registers a close hook that closes the server and destroys
open connections.

## `role:transport,hook:client,type:web` (`http`, `direct`)

Creates a client that posts each message to
`<protocol>://<host>:<port><path>` (`0.0.0.0` becomes `127.0.0.1`).
Missing keys are filled from the plugin's `web` options; `web.headers`
adds request headers. The reply is the client object. Sending happens
in `send(msg, reply, meta)`, called by the core's client action; the
request and response formats, and how non-2xx responses become errors,
are in [HTTP protocol](http-protocol.md#how-the-client-reads-a-response).

The hook registers a close hook (nothing to release: each request uses
its own connection).

## `role:transport,hook:client,type:tcp`

Creates a client that opens one connection to `host:port` (`0.0.0.0`
becomes `127.0.0.1`), reconnects when it drops, and writes each message
as one ndjson line. A `path` in the configuration is not used. Messages sent before the connection is established
wait for it. The reply is the client object. See
[TCP protocol](tcp-protocol.md).

The hook registers a close hook that disconnects and destroys the
connection.

## Close hooks

`transportUtil.close(seneca, closer)` adds a prior on the close action.
When the instance closes, each hook runs its `closer(done)` and then
calls the prior, so all hooks run in reverse order of registration
followed by the core's close. The pattern is chosen from
`seneca.version`: `role:seneca,cmd:close` for versions below 4,
`sys:seneca,cmd:close` otherwise. An inbound `sys:seneca,cmd:close`
message received by a listener runs the same hooks (see
[Security](http-protocol.md#security)).
