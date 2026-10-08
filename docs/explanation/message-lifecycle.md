# How a message travels

This page follows one message from `seneca.act` on a client instance to
the action on a listening instance and back, and explains the pieces
the plugin adds on the way: the envelope, the identifiers, the call map
and the loop checks. The wire formats are specified in
[HTTP protocol](../reference/http-protocol.md) and
[TCP protocol](../reference/tcp-protocol.md); the Seneca side of
`listen` and `client` is described in the core
[Transport reference](https://github.com/senecajs/seneca/blob/master/docs/reference/transport.md).

## The pieces

```
client instance                                  listening instance
---------------                                  ------------------
seneca.act(msg) -> client action (added by        HTTP server or TCP socket
  seneca.client for each pin)                      |
  |                                                v
  v                                              handle_request: checks, then
prepare_request: envelope {id, kind:'act',          seneca.act(act + id$ + transport$)
  origin, track, time, act, sync}                  |
  |  stored in the call map under id               v
  v                                              action runs, replies (err, out)
send over HTTP or TCP  ----------------------->    |
                                                   v
                                                 update_output: envelope {id, kind:'res',
                                                   origin, accept, track, time, res | error}
handle_response: checks, call map lookup,  <-----  |
  callback(err, result)
```

Seneca core supplies the client action and the dispatch to the plugin's
hooks; the plugin supplies everything from `prepare_request` to
`handle_response`.

## 1. The client action

`seneca.client({ pin: 'role:color,cmd:*', ... })` makes Seneca add an
action for the pin (marked `client$: true`). When a message matches, the
action calls the plugin's `send` function with the message, the reply
callback and the meta data. Routing therefore follows the normal
pattern rules: a local action added later for the same pattern becomes
the current handler and the client action its prior; `local$: true`
keeps a message local. Without a pin the client handles every message
that has no local action.

The plugin's hook (`role:transport,hook:client,type:web` or `tcp`)
builds the client object once, when `seneca.client()` is called. For
`tcp` the connection is opened at that point; for `web` nothing is sent
until the first message.

## 2. The envelope

`prepare_request` turns the message into the request envelope. Here is
a real one, captured by [memory-transport.js](../examples/memory-transport.js),
a transport that prints what it carries:

```json
{"id":"0fci7uy42i6c/4sydzpirf78y","kind":"act",
 "origin":"7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client",
 "track":["7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client"],
 "time":{"client_sent":1791442428618},
 "act":{"role":"color","cmd":"hex","name":"red","custom$":{}},
 "sync":true,
 "msg$":{"vin":1,"sid":"7mn27t7l3bcs/1791442428498/10446/4.0.0-rc5/client","out":true,
         "mid":"0fci7uy42i6c","cid":"4sydzpirf78y","snc":true,"pat":"cmd:*,role:color"}}
```

* `id` is the Seneca message id, `mi/tx`: the message identifier and
  the transaction identifier.
* `origin` is the sending instance's `seneca.id`; `track` lists the
  instances the message has passed through (see loop detection below).
* `act` is the message without its `$` directives (`seneca.util.clean`),
  plus `custom$` carrying `meta.custom`, so that custom meta data
  reaches the remote action.
* `sync` says whether a reply is expected (`sync$: false` on the
  message turns it off).
* `msg$` repeats some of this in the field names of the original
  protocol design; the listener does not read it.

Over HTTP the `act` object is the body and the other fields travel in
`seneca-*` headers; over TCP the whole envelope is one ndjson line.

## 3. The call map

Before sending, the plugin stores the reply callback in the *call map*,
an LRU cache keyed by `id` and limited to `callmax` entries (default
1111). `role:transport,cmd:inflight` lists it:

```js
{
  'm7hcyktllf35/c6g3ed32dlt5': {
    args: { role: 'slow', cmd: 'run', ms: 300 },
    done: [Function: bound bound action_reply],
    when: 1791442427217
  }
}
```

The call map is what matches a reply to its waiting caller, which
matters for TCP, where many requests share one connection and replies
can arrive in any order. It is also the reason `callmax` is a hard
limit: when more than `callmax` requests are in flight, the oldest entry
is evicted, its reply is dropped with an `unknown_message_id` warning,
and that caller gets an `action_timeout`.

A message with `sync$: false` is not stored; its callback is called at
once with `null`, and the reply, if any, is ignored.

## 4. On the listening side

`handle_request` runs these checks on the envelope, answering with an
error envelope when one fails: the data exists (`no_data`), `kind` is
`act` (`invalid_kind_act`), `id` is not null (`no_message_id`), the
message was not sent by this very instance (`own_message`), this
instance is not already in `track` (`message_loop`), and the envelope
carries no `error` (`data_error`).

It then submits the message to the local instance with
`seneca.act`, adding two things: `id$`, so that the action runs with
the same message and transaction identifiers as the caller's message
(the service log shows the client's `id`), and `transport$`, an object
`{ track, origin, time }` the action can inspect:

```js
this.add('role:color,cmd:whoami', function (msg, reply) {
  // transport$ is set on messages that arrived through a listener
  reply({ origin: msg.transport$ ? msg.transport$.origin : 'local' })
})
```

Called locally this replies `{ origin: 'local' }`; called through a
client, with the client's instance id, for example
`{ origin: 'j9grm67r1bqt/1791444239520/28070/4.0.0-rc5/client' }`
(the same on Seneca 3).

The listener's `pin` is not applied here: any pattern the listening
instance knows can be invoked by anyone who can reach the port,
including the builtin `sys:seneca,cmd:ping` and `sys:seneca,cmd:close`
(an inbound close message runs the close hooks, the listening sockets
are released, and a service process with nothing else to do exits). Do
not expose a listener to an untrusted network; put it behind a firewall
or a proxy that allows only known paths and messages. The pin is
enforced on the client side, where it decides which
messages are sent.

## 5. The reply

When the action replies, `update_output` completes the response
envelope: `res` holds the result (or `null`), `error` holds a flattened
copy of the error when there is one (see
[Errors on the wire](errors-on-the-wire.md)), and `time` gains
`listen_recv` and `listen_sent`. Over HTTP the result becomes the body
and the rest headers; over TCP the envelope is one line.

Back on the client, `handle_response` checks that `kind` is `res`, that
`id` is present and that `origin` is this instance (replies for someone
else are dropped with an `invalid_origin` warning), rebuilds an `Error`
when `error` is set, converts `entity$` objects back into entities when
the entity plugin is loaded, finds the callback in the call map, removes
the entry and calls the callback. The caller's `act` callback or `post`
promise then completes as for a local action.

The listener's reply also carries `accept` (the id of the instance
that handled the message) and the timing fields; the plugin passes them
to Seneca as a third argument of the reply, which Seneca 4 does not
expose to the caller.

## 6. Loop detection and its limits

Two checks protect a listener from messages that come back to it:

* `own_message`: the inbound `id` is in this instance's own call map,
  so the message is one this instance is itself waiting for.
* `message_loop`: this instance's id is in the inbound `track`.

Both answer with an error envelope and log a warning (options
`check.*` and `warn.*`). Here `message_loop` is triggered by hand with
`curl`, by sending the listener its own id in the `seneca-track` header
([protocol-service.js](../examples/protocol-service.js) prints its id
when it starts):

```
$ curl -s -X POST http://127.0.0.1:8280/act -H 'seneca-id: abc/def' -H 'seneca-origin: curl' -H 'seneca-track: ["9n3adn54mxnp/1791443865393/25365/4.0.0-rc5/protocol"]' -d '{"role":"color","cmd":"list"}'
{"eraro":true,"orig":null,"code":"message_loop","seneca":true,"package":"seneca","msg":"seneca: Inbound message rejected as looping back to this server.","details":{},"callpoint":"at internals.Utils.handle_request (/home/user/seneca-transport/lib/transport-utils.js:260:56)"}
```

The `track` is meant to grow by one instance per hop: `prepare_request`
copies the `track` of an inbound message (`msg.transport$.track`) and
appends the sending instance. In version 8.4 that copy is made with
`seneca.util.deep`, which turns an array into a plain object, so an
instance that relays an inbound message object through one of its own
clients fails with the error `track.push is not a function`, delivered
to the original caller. This happens on Seneca 3 and 4 alike. In
practice this means that a loop through this plugin's own clients
(a to b to a) is stopped by that error rather than by `message_loop`,
and that multi-hop relaying of the same message object does not work.
An instance that forwards work must send a new message without the
inbound `$` properties, which starts a new `track`:

```js
// On the relaying instance b, which has a client for r:1
this.add('q:2', function (msg, reply) {
  const forward = this.util.clean(msg) // a copy without transport$ and the other $ properties
  delete forward.q
  forward.r = 1
  this.act(forward, reply)
})
```

With a client sending to b and b's client sending to c, relaying the
inbound `q:1` object through a client and forwarding `q:2` this way
gave:

```
relay inbound object (q:1) -> ERR track.push is not a function
forward a new message (q:2) -> { from: 'c', track: 1 }
```

(`track: 1` is the length of the track that reached c: b only.) The
checks still work as described for envelopes produced by other clients,
as the `curl` example shows.

## 7. Closing

Each listener and each client registers a close hook with
`transportUtil.close`. On Seneca 4 the hook is a prior on
`sys:seneca,cmd:close`; on Seneca 3 on `role:seneca,cmd:close`. When the
instance closes, HTTP servers stop listening, TCP servers stop
listening and destroy their connections, and TCP clients disconnect.
A process that closed all its instances exits by itself.

## 8. What is not recorded

Seneca core records every `listen` and `client` call in
`seneca.status().transport.register` and summarizes them in
`seneca.ping().tr`. This plugin replaces the core actions
`role:transport,cmd:listen` and `role:transport,cmd:client` with its own
and does not call the core versions, so with the plugin loaded both
lists stay empty.
