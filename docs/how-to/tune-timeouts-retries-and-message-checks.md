# Tune timeouts, retries and message checks

Goal: set the limits that decide how long a remote call may take, what
happens when a port is busy, how many calls may be in flight, and which
inbound messages are rejected. The timeout program is
[timeouts.js](../examples/timeouts.js).

## 1. The three timeouts of a remote call

| Timeout | Set with | Default | Error |
| ------- | -------- | ------- | ----- |
| Seneca action timeout | `Seneca({ timeout })` on the client instance, or `timeout$` on the message | 22222 ms | `action_timeout` |
| HTTP request timeout | `timeout` in the `client` configuration or `web.timeout` plugin option | 5555 ms | `Client request timeout` (no `code`) |
| HTTP listener response timeout | `web.timeout` on the listener | 5555 ms | none: not effective on Node.js 16 and later (see below) |

Whichever fires first wins. The example runs the same slow action under
three settings:

```
$ node timeouts.js
defaults, action takes 200 ms: ok { slept: 200 } after 225 ms
seneca timeout 300 ms, action takes 1000 ms: error after 335 ms
  code: action_timeout | message: "seneca: undefinedAction cmd:*,role:slow timed out."
client request timeout 300 ms, action takes 1000 ms: error after 305 ms
  code: undefined | message: "Client request timeout"
```

So: keep the Seneca `timeout` as the limit you reason about (it has a
code and details), and set the HTTP request `timeout` above it, or to
the same value, so that slow calls fail with `action_timeout` rather
than with a library error:

```js
Seneca({ timeout: 10000 })
  .use('@seneca/transport', { web: { timeout: 10000 } })
```

The listener's `timeout` would answer `503 Response timeout`, but the
timer is cleared when the request body has been read, which on Node.js
16 and later happens before the action runs. Verified on Node.js 24: a
7 second action was answered after 7 seconds with `200`. Bound slow
actions on the service with the service's own Seneca `timeout` instead.

TCP calls are bounded by the Seneca `timeout` only; `tcp.timeout` is
not used.

## 2. Retry a busy port

A `web` listener retries `max_listen_attempts` times (default 11) after
`EADDRINUSE`, waiting 100 ms plus up to `attempt_delay` ms (default
222) between attempts, then fails fatally (`transport_listen`, exit
code 1). This covers a restart while the previous process is still
releasing the port:

```js
seneca.listen({ type: 'web', port: 8270, max_listen_attempts: 50, attempt_delay: 500 })
```

A `tcp` listener has no retry defaults: it logs `net-error` and never
completes, and the process dies with `action_timeout` after the Seneca
`timeout`. Give it both values when restarts are expected:

```js
seneca.listen({ type: 'tcp', port: 8271, max_listen_attempts: 10, attempt_delay: 200 })
```

Each retry logs a `listen attempt` warning with the full configuration.

## 3. Allow enough in-flight calls

The call map holds at most `callmax` (default 1111) requests waiting for
a reply. Beyond that the oldest request is forgotten: its reply is
dropped with an `unknown_message_id` warning and the caller gets
`action_timeout`. Verified with `callmax: 1` and two concurrent calls:

```
call 0 rejected action_timeout 1563 ms
call 1 fulfilled { slept: 400 } 1564 ms
```

Raise `callmax` on clients that fan out many concurrent calls:

```js
seneca.use('@seneca/transport', { callmax: 10000 })
```

## 4. Loop and origin checks

Listeners reject inbound messages they are themselves waiting for
(`check.own_message`) and messages whose `track` already contains them
(`check.message_loop`); clients drop replies that are not theirs. Each
rejection logs a warning controlled by the `warn` options:

```js
seneca.use('@seneca/transport', {
  check: { message_loop: true, own_message: true },
  warn: {
    unknown_message_id: true, invalid_kind: true, invalid_origin: true,
    no_message_id: true, message_loop: true, own_message: true,
  },
})
```

Turn a check off only when you deliberately route a message back to its
origin. Note the limitation described in
[Loop detection and its limits](../explanation/message-lifecycle.md#6-loop-detection-and-its-limits):
relaying an inbound message object through a second client fails with
`track.push is not a function`; forward a new message instead.

## 5. Fire and forget

A message with `sync$: false` returns at once with `null`, is not
counted against `callmax`, and never times out; the remote action still
runs. Use it for notifications whose result you do not need.
