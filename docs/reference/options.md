# Options reference

Two kinds of settings control the plugin: *plugin options*, given to
`seneca.use('@seneca/transport', options)` or in
`options.plugin.transport`, and the *configuration* of each `listen` and
`client` call. This page lists both, with every default, and explains
how they are combined. Values are read from `transport.js`, `lib/http.js`
and `lib/tcp.js`; the precedence rules were verified on Seneca 3.38,
4.0.0-rc5 and 4.0.0.

## Plugin options

### Top level

| Option | Default | Effect |
| ------ | ------- | ------ |
| `msgprefix` | `'seneca_'` | Prefix of the topic names derived from pins by the `transport/utils` helpers (`seneca_any`, `seneca_cmd_hex_role_color_`). Topics are used by transports built on the helpers, such as message queues; the `web` and `tcp` transports ignore them. |
| `callmax` | `1111` | Maximum number of in-flight requests per instance (the size of the call map, an LRU cache). When exceeded, the oldest waiting request is forgotten: its reply is dropped with an `unknown_message_id` warning and the caller gets an `action_timeout`. |
| `msgidlen` | `12` | Accepted for compatibility; not read by version 8.4 (message identifiers come from Seneca). |

### `warn`

Each flag enables the warning log entry (`seneca.log.warn`) written
when the corresponding check fails. The check itself is not affected.

| Option | Default | Written by |
| ------ | ------- | ---------- |
| `warn.unknown_message_id` | `true` | Client: a reply arrived for an id that is not in the call map. |
| `warn.invalid_kind` | `true` | Listener: inbound envelope whose `kind` is not `act`. Client: reply whose `kind` is not `res`. |
| `warn.invalid_origin` | `true` | Client: reply whose `origin` is not this instance. |
| `warn.no_message_id` | `true` | Listener or client: envelope with `id: null`. |
| `warn.message_loop` | `true` | Listener: this instance's id is in the inbound `track`. |
| `warn.own_message` | `true` | Listener: the inbound `id` is in this instance's own call map. |

### `check`

| Option | Default | Effect |
| ------ | ------- | ------ |
| `check.message_loop` | `true` | Reject inbound messages whose `track` contains this instance (`message_loop` error). |
| `check.own_message` | `true` | Reject inbound messages whose `id` this instance is itself waiting for (`own_message` error). |

See [Loop detection and its limits](../explanation/message-lifecycle.md#6-loop-detection-and-its-limits)
for what these checks can and cannot catch.

### `web`

Defaults for the `web` type and its aliases `http` and `direct`. A key
takes effect only when neither the call's configuration nor the core's
`transport` options supply it (see
[How a configuration is resolved](#how-a-configuration-is-resolved)).

| Option | Default | Effect |
| ------ | ------- | ------ |
| `web.type` | `'web'` | Type name. |
| `web.port` | `10101` | Never takes effect: the core always supplies `transport.port` (default 10101). Set the port per call or with `Seneca({ transport: { port } })`. |
| `web.host` | `'0.0.0.0'` | Address to bind (listen) or connect to (client). A client never connects to `0.0.0.0`; it uses `127.0.0.1` instead. Overridden on Seneca 4.0.0-rc5, whose core supplies `transport.host: '127.0.0.1'`. |
| `web.path` | `'/act'` | URL path. The listener answers 404 to any other path; the client posts to it. Overridden on Seneca 4.0.0-rc5, whose core supplies `transport.path: '/act'`. |
| `web.protocol` | `'http'` | `http` or `https`. Overridden on Seneca 4.0.0-rc5 (`transport.protocol: 'http'`), so give `protocol: 'https'` per call. |
| `web.timeout` | `5555` | Milliseconds. Client: the HTTP request timeout (`Client request timeout` error). Listener: the response timeout timer, which on Node.js 16 and later is cleared when the request body has been read and so does not fire; see [HTTP protocol](http-protocol.md#timeouts). |
| `web.max_listen_attempts` | `11` | Listener: how many times to retry `listen` after `EADDRINUSE` before failing. |
| `web.attempt_delay` | `222` | Listener: the retry delay is 100 ms plus a random part of up to this many milliseconds. |
| `web.serverOptions` | `{}` | Listener: passed to `https.createServer` when `protocol` is `https` (`key`, `cert`, `ca`, ...). Ignored for `http`. |
| `web.headers` | none | Client: extra HTTP request headers. The names `Accept`, `Content-Type`, `Content-Length`, `Cache-Control`, `seneca-id`, `seneca-kind`, `seneca-origin`, `seneca-track`, `seneca-time-client-sent`, `seneca-accept`, `seneca-time-listen-recv` and `seneca-time-listen-sent` are reserved and removed, compared exactly as written: another spelling (`accept`, `Seneca-Kind`) is kept and replaces the plugin's own header. This is a plugin option only; a `headers` key in the client configuration or in `transport.web` is ignored. |

### `tcp`

| Option | Default | Effect |
| ------ | ------- | ------ |
| `tcp.type` | `'tcp'` | Type name. |
| `tcp.host` | `'0.0.0.0'` | Address to bind or connect to (a client uses `127.0.0.1` for `0.0.0.0`). Overridden on Seneca 4.0.0-rc5, as `web.host`. |
| `tcp.port` | `10201` | Never takes effect: the core always supplies `transport.port` (default 10101), so `listen({ type: 'tcp' })` without a port listens on 10101. |
| `tcp.path` | none | Listener: a UNIX domain socket path. When set, TCP listeners whose configuration has no path of its own bind this socket instead of a port. On Seneca 4.0.0-rc5 it also replaces the `/act` the core puts into every configuration. |
| `tcp.timeout` | `5555` | Accepted; not read by the TCP transport. The Seneca `timeout` option bounds TCP calls. |
| `tcp.max_listen_attempts` | none | No default: a TCP listener does not retry after `EADDRINUSE` unless this is set. |
| `tcp.attempt_delay` | none | Retry delay, as for `web.attempt_delay`. Set it together with `tcp.max_listen_attempts`. |

## Configuration keys of `listen` and `client`

The argument of `seneca.listen` and `seneca.client` is an object, or a
port, or `port, host`, or `port, host, path`. Keys understood by the
plugin:

| Key | Applies to | Meaning |
| --- | ---------- | ------- |
| `type` | both | `web`, `http`, `direct` (all HTTP) or `tcp`. Default `web`. The types `pubsub` and `queue` fail with `plugin-needed`. |
| `port` | both | Port. `0` makes a listener pick a free port; the `listen` callback result has the real `port`. For `web` the value may be a function `(config) => port`. |
| `host` | both | Address. For `web` the value may be a function. |
| `path` | both | `web`: URL path; may be a function. `tcp` listener: UNIX domain socket path, used instead of host and port (see the rules below). `tcp` client: not supported; the client always connects by host and port. |
| `protocol` | web | `http` or `https`. The client uses it to build the URL. |
| `pin`, `pins` | both | Patterns, as strings or objects; several as an array. Client: the messages sent to the remote side (and the client's identity). Listener: documentation only; the listener accepts any message the instance can handle (see [HTTP protocol](http-protocol.md#security)). |
| `timeout` | web client | Request timeout in milliseconds (overrides `web.timeout`). |
| `serverOptions` | web listener | HTTPS server options (overrides `web.serverOptions`). |
| `max_listen_attempts`, `attempt_delay` | listener | Retry settings (override the type defaults). |
| `id` | client | Client identifier; the core sets it to the canonical configuration when absent. |
| `override` | client | Core feature: wrap existing local actions so that the remote side handles them. |
| `makehandle` | client | Core feature for transport plugins. |

Keys are described in the core
[Transport reference](https://github.com/senecajs/seneca/blob/master/docs/reference/transport.md).

### The TCP `path`

A TCP listener binds a UNIX domain socket when its resolved
configuration has a `path`:

* A `path` given in the `listen` call is used as given.
* A top level `Seneca({ transport: { path } })` is copied by the core
  into every `listen` configuration, so it also turns TCP listeners into
  socket listeners (Seneca 3 and 4 alike). Set HTTP paths per call or in
  a `web` section instead.
* Seneca 4.0.0-rc5 sets `transport.path` to `/act` by default. When both
  the configuration's `path` and `transport.path` are `/act`, the
  listener ignores the value and uses `tcp.path` if set, otherwise
  `host` and `port`. Seneca 4.0.0 no longer sets that default.
* Otherwise the plugin option `tcp.path` applies, if set.

## How a configuration is resolved

1. The core parses the arguments into a configuration object.
2. Every scalar value of the core's `options.transport` fills a missing
   key. By default this is `port: 10101`; on Seneca 4.0.0-rc5 also
   `host: '127.0.0.1'`, `path: '/act'` and `protocol: 'http'`.
3. `type` defaults to `web`.
4. The core section `options.transport[type]` (for example
   `Seneca({ transport: { web: { timeout: 10000 } } })`) fills keys that
   are still missing.
5. The core sends `role:transport,cmd:listen` or `cmd:client` with the
   configuration; the plugin forwards it to the hook for the type.
6. The hook merges the plugin's type options under the configuration:
   `web` for `web`, `http` and `direct`; `tcp` for `tcp`.

So, from highest to lowest precedence: the call's configuration, the
core's top level `transport` values, the core section
`transport.<type>`, the plugin option, the plugin default. Because the
core always supplies `transport.port`, a port can only be set per call
or with the top level `transport.port`; on Seneca 4.0.0-rc5 the same
holds for `host`, `path` and `protocol`.
[precedence.js](../examples/precedence.js) starts TCP listeners
configured in different places and prints what each one ends up with;
the output is the same on Seneca 3.38, 4.0.0-rc5 and 4.0.0:

```
$ node precedence.js
plugin option tcp.port: port 10101, timeout 5555
core section transport.tcp.port: port 10101, timeout 5555
core top level transport.port: port 23203, timeout 5555
listen port, with all of the above: port 23204, timeout 5555
plugin option tcp.timeout: port 23205, timeout 1111
core section transport.tcp.timeout, plugin option set: port 23206, timeout 2222
core top level transport.timeout, section set: port 23207, timeout 3333
listen timeout, with all of the above: port 23208, timeout 4444
```

## Message directives read by the plugin

| Directive | Effect |
| --------- | ------ |
| `sync$: false` | Fire and forget: the client's callback is called at once with `null`, no call map entry is made, and the reply is ignored (a TCP listener does not send one). The remote action still runs. |
| `local$: true` | Core: the message stays local (the client action passes it to its prior). |
| `custom$` | Set by the plugin on the wire from `meta.custom`, so that custom meta data reaches the remote action. |
| `transport$` | Set by the listener on inbound messages: `{ track, origin, time }`. |
| `id$` | Set by the listener so that the remote action runs with the caller's message and transaction identifiers. |
