# TCP protocol reference

What a `tcp` listener accepts and answers, and how a `tcp` client
behaves. The outputs were captured with the [examples](../examples/).

## Frames

Each request and each response is one complete envelope object encoded
as a line of newline delimited JSON (`ndjson`): `JSON.stringify(envelope) + '\n'`.
Several requests may be in flight on one connection; responses are
matched to requests by `id`, not by order.

### Request envelope

```json
{"id":"request-1/transaction-1","kind":"act","origin":"raw-tcp-client","track":[],
 "time":{"client_sent":1791442428074},
 "act":{"role":"color","cmd":"hex","name":"blue"},"sync":true}
```

| Field | Meaning |
| ----- | ------- |
| `id` | Message id, `mi/tx`. The listener runs the action with this id and uses the `tx` part as transaction id. Must not be `null` (`no_message_id`). |
| `kind` | Must be `act` (`invalid_kind_act`). |
| `origin` | Sending instance id. Copied into the response and into `msg.transport$.origin`. |
| `track` | Array of instance ids the message has visited. A track containing the listener's id is rejected (`message_loop`). |
| `time` | `{ client_sent }`, milliseconds. |
| `act` | The message. `$` directives are not expected; `custom$` is understood. |
| `sync` | `true` when a response is wanted. With `false` the action runs but no response line is written. |
| `msg$` | Optional; written by Seneca clients, ignored by the listener. |

### Response envelope

```json
{"id":"request-1/transaction-1","kind":"res","origin":"raw-tcp-client",
 "accept":"8nm49wjj6rvv/1791442427939/10436/4.0.0-rc5/service","track":[],
 "time":{"client_sent":1791442428074,"listen_recv":1791442428076,"listen_sent":1791442428077},
 "sync":true,"res":{"name":"blue","hex":"#0000FF"}}
```

| Field | Meaning |
| ----- | ------- |
| `id`, `origin`, `track`, `sync` | Copied from the request. |
| `kind` | `res`. |
| `accept` | The listening instance id. |
| `time` | `client_sent` from the request, plus `listen_recv` and `listen_sent`. |
| `res` | The result, or `null` (also `null` when there is an error). |
| `error` | Only on failure: the flattened error (`message`, `name`, `code`, `details`, ...). |
| `input` | Only on failure: the message as it was submitted, including `transport$` and `id$`. |

A client checks `kind`, `id` and `origin` (which must be its own id)
before matching the response to its call map; see
[How a message travels](../explanation/message-lifecycle.md).

### Invalid lines

A line that is not valid JSON makes the listener's parser emit an error,
which is printed to standard error (`Error: Could not parse row ...`),
and the connection is ended without a response. A Seneca client then
reconnects. (The listener contains a response for `invalid_json`, but
the parser fails before it is reached.)

## Listener

`seneca.listen({ type: 'tcp', ... })` with these keys (defaults from
the plugin's `tcp` options):

| Key | Default | Meaning |
| --- | ------- | ------- |
| `port` | `10101`, from the core's shared `transport.port` (the plugin's own `tcp.port` default, 10201, never takes effect) | Port. `0` picks a free port. |
| `host` | `0.0.0.0` (`127.0.0.1` on Seneca 4.0.0-rc5) | Address to bind. |
| `path` | `tcp.path` plugin option, none by default | UNIX domain socket path. When set, the server listens on the socket file and ignores host and port; the file is removed when the server closes. A top level `transport.path` reaches this key too. When both this `path` and the shared `transport.path` are `/act` (the Seneca 4.0.0-rc5 default), the value is ignored in favour of `tcp.path`. See [The TCP `path`](options.md#the-tcp-path). |
| `max_listen_attempts`, `attempt_delay` | none | Retries after `EADDRINUSE`. Without them a bind failure is logged (`net-error`) and `listen` never completes; the process dies with `action_timeout` after the Seneca `timeout`. |
| `timeout` | `5555` | Not used by the TCP transport. |

The `listen` callback receives the merged options (the plugin's `tcp`
options under the configuration) with the real `port`, undefined for a
socket path. On Seneca 4.0.0-rc5, for `listen({ type: 'tcp', port:
8271, pin: 'role:color,cmd:*' })` and for `listen({ type: 'tcp', path:
'color.sock' })` (a path relative to the working directory):

```js
{
  type: 'tcp',
  port: 8271,
  pin: 'role:color,cmd:*',
  host: '127.0.0.1',
  path: '/act',
  protocol: 'http',
  role: 'transport',
  hook: 'listen',
  'plugin$': { full: 'transport', name: 'transport', tag: '-' },
  'tx$': 'ngc74xyp3vhp',
  timeout: 5555
}
{
  type: 'tcp',
  path: 'color.sock',
  port: undefined,
  host: '127.0.0.1',
  protocol: 'http',
  role: 'transport',
  hook: 'listen',
  'plugin$': { full: 'transport', name: 'transport', tag: '-' },
  'tx$': 'bxmfbczlovva',
  timeout: 5555
}
```

The first result shows the `/act` that the rc5 core puts into every
configuration; the listener ignored it and bound port 8271. `host`,
`path` and `protocol` come from the same core defaults and are not
used otherwise by a TCP listener.

Each connection gets its own parser and serializer; connection errors
are logged (`pipe-error`). On close the server stops listening and every
open connection is destroyed.

## Client

`seneca.client({ type: 'tcp', ... })` opens one connection to
`host:port` when the client is created (`0.0.0.0` becomes `127.0.0.1`).
A `path` is not supported on the client side, so a UNIX socket listener
is for clients you write yourself:
[raw-tcp-client.js](../examples/raw-tcp-client.js) speaks the protocol
over a port, and the same code works on a socket with
`net.connect(path)`.

The connection is managed by [reconnect-core](https://github.com/juliangruber/reconnect-core)
with its default backoff, a Fibonacci sequence of delays from 1 second
up to 30 seconds: when the connection drops, the client logs
`disconnect` and reconnects; messages sent while no connection is
established wait for the next connection. Requests that were in flight
when the connection dropped are not resent; they time out
(`action_timeout`).

The client's call map is keyed by `id`, so responses may arrive in any
order. On close the client disconnects and destroys the connection.

A client that has never connected when it is closed (the service is
down) logs an error entry while closing, because it has no connection
to destroy, and keeps the process alive until its next reconnect
attempt is due.

## Differences from HTTP

* One connection per client instead of one request per message.
* Error replies carry `input` as well as `error`.
* `sync: false` requests get no response at all.
* No status codes: a result with `statusCode` is an ordinary result.
* No path check and no non-Seneca convenience: every line must be a
  complete request envelope.
