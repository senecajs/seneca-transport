# Listen on a specific host, port and path

Goal: bind a listener exactly where you want it: an interface, a fixed
or free port, an HTTP path, or a UNIX domain socket.

## 1. Interface

```js
seneca.listen({ type: 'web', host: '0.0.0.0', port: 8270 })   // all interfaces
seneca.listen({ type: 'web', host: '127.0.0.1', port: 8270 }) // loopback only
```

The plugin default is `0.0.0.0`; on Seneca 4.0.0-rc5 the core supplies
`127.0.0.1` instead (see [Seneca 3 versus 4](../explanation/seneca-3-versus-4.md)),
so set `host` explicitly for a service that must accept remote
connections. A client given `host: '0.0.0.0'` connects to `127.0.0.1`.

## 2. Port

Fixed:

```js
seneca.listen({ type: 'web', port: 8270 })
```

Free port chosen by the operating system:

```js
seneca.listen({ type: 'web', port: 0 }, function (err, out) {
  console.log('listening on', out.port)   // for example 33227
})
```

Without a `port` the core's shared `transport.port` applies: 10101 for
every type, including `tcp`. Change it for every call with
`Seneca({ transport: { port: 9000 } })`; the plugin options `web.port`
and `tcp.port`, and the core sections `transport.web.port` and
`transport.tcp.port`, never take effect (see
[How a configuration is resolved](../reference/options.md#how-a-configuration-is-resolved)).

If the port is taken, a `web` listener retries 11 times at random
intervals of 100 to 322 ms (`web.max_listen_attempts`,
`web.attempt_delay`), logging a `listen attempt` warning each time, and
then fails fatally (`transport_listen`, exit code 1). A `tcp` listener
does not retry unless `max_listen_attempts` and `attempt_delay` are set;
see [Tune timeouts, retries and message checks](tune-timeouts-retries-and-message-checks.md).

## 3. HTTP path

```js
seneca.listen({ type: 'web', port: 8270, path: '/api/messages' })
seneca.client({ type: 'web', port: 8270, path: '/api/messages' })
```

The listener answers `404` with an empty body to every other path, so a
service can share a host with other HTTP servers behind a path routing
proxy. A Seneca client posting to the wrong path fails at once with
`Response Error: 404 Not Found`. The default path is `/act`.

To set the path for every `web` call, use a `web` section (the core
option `transport.web.path` or the plugin option `web.path`), not the
top level `transport.path`: the core copies top level `transport` values
into every configuration, TCP ones included, and a TCP listener reads a
path as a socket file (next step). On Seneca 4.0.0-rc5 the `web`
sections are overridden by the core's own `path: '/act'`, so give the
path per call there.

## 4. UNIX domain socket (TCP only)

A `path` makes a TCP listener bind a socket file instead of a host and
port:

```js
seneca.listen({ type: 'tcp', path: '/var/run/color.sock' })
```

or, for every TCP listener of the instance, as a plugin option:

```js
seneca.use('@seneca/transport', { tcp: { path: '/var/run/color.sock' } })
seneca.listen({ type: 'tcp' })
```

The `listen` callback then reports `port` as undefined. The file is
removed when the instance closes.

Where the path comes from matters:

* A path in the `listen` configuration is used as given.
* A top level `Seneca({ transport: { path } })` is copied by the core
  into every `listen` configuration, so it also turns TCP listeners into
  socket listeners, on Seneca 3 and 4 alike.
* Seneca 4.0.0-rc5 sets `transport.path` to `/act` by default and copies
  it into every configuration. The plugin ignores that value (when both
  the configuration's path and `transport.path` are `/act`) and uses its
  `tcp.path` option instead, or the port when that is not set. Seneca
  4.0.0 no longer sets the default.

The plugin's TCP client connects by host and port only, so a socket
listener is for clients you write yourself; see
[Call a listener without Seneca](call-a-listener-without-seneca.md).

## 5. Verify

```
$ node http-service.js
color service listening on port 8270 as kpr6g4la2i4f/1791443865384/25366/4.0.0-rc5/color
$ curl -s -X POST http://127.0.0.1:8270/act -d '{"role":"color","cmd":"list"}'
{"names":["red","green","blue","plum"]}
```
