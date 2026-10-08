# Call a listener from curl or another non-Seneca client

Goal: send messages to a Seneca service from code that does not use
Seneca: a shell script, another language, a browser, a TCP socket.

## HTTP

### 1. Post a JSON message

With the HTTP service of the tutorial running
([http-service.js](../examples/http-service.js)):

```
$ curl -s -X POST http://127.0.0.1:8270/act -H 'Content-Type: application/json' \
    -d '{"role":"color","cmd":"hex","name":"plum"}'
{"name":"plum","hex":"#8E4585"}
```

The body is the message; the response body is the result. No special
headers are needed: without a `seneca-id` header the listener makes up
an id and uses your `User-Agent` as origin.

### 2. Or use query parameters

```
$ curl -s 'http://127.0.0.1:8270/act?role=color&cmd=hex&name=plum'
{"name":"plum","hex":"#8E4585"}
```

Query values are strings. For typed values or nested objects use the
`msg$` parameter, parsed as [Jsonic](https://github.com/jsonicjs/jsonic):

```
$ curl -s 'http://127.0.0.1:8270/act?msg$=role:color,cmd:list'
{"names":["red","green","blue","plum"]}
```

Query parameters override body properties.

### 3. Handle errors

An error reply has status 500 (or the error's own `statusCode`) and the
error as JSON body:

```
$ curl -s -i -X POST http://127.0.0.1:8270/act -d '{"role":"color","cmd":"hex","name":"pink"}'
HTTP/1.1 500 Internal Server Error
...
{"eraro":true,"orig":null,"code":"unknown_color",...,"message":"seneca: Unknown color: pink.","name":"Error"}
```

A wrong path gives `404` with an empty body; an invalid JSON body gives
`500` with an `invalid_json` error. The full list is in the
[HTTP protocol reference](../reference/http-protocol.md#status-codes).

### 4. Answer a Seneca client from your own server

If you write a server that Seneca clients call, read the message from
the body and reply as a Seneca listener does:

* Success: status `200`, a JSON object as body, and the request headers
  `seneca-id` and `seneca-origin` echoed in the response. A `200`
  response without them is dropped by the client (`invalid_origin`)
  and the caller waits for its timeout.
* Failure that the caller should see as its own error: a non-2xx status
  (500, or a more specific one), the same echoed headers plus
  `seneca-kind: res`, and the error as a JSON body (`message`, `code`,
  any plain properties). The client rebuilds an `Error` from the body.
* Any other non-2xx response, without `seneca-kind: res` (a proxy's
  `502`, a `404` for a wrong path), fails the call at once with the
  HTTP client's error, for example `Response Error: 502 Bad Gateway`.

[answer-seneca-clients.js](../examples/answer-seneca-clients.js) is
such a server, answering in each of these ways:

```
$ node answer-seneca-clients.js
result, headers echoed: result { ok: true } after 19 ms
result, no headers: error after 1561 ms
  message: "seneca: undefinedAction cmd:*,role:remote timed out." | code: action_timeout
error, seneca-kind: res: error after 4 ms
  message: "remote says no" | code: no
error, not marked: error after 4 ms
  message: "Response Error: 502 Bad Gateway" | code: undefined
```

## TCP

The TCP listener speaks newline delimited JSON. Send one request
envelope per line and read one response envelope per line.
[raw-tcp-client.js](../examples/raw-tcp-client.js) does it with Node's
`net` module (it starts its own listener on port 8272):

```js
const socket = Net.connect(8272, '127.0.0.1', function () {
  const request = {
    id: 'request-1/transaction-1',
    kind: 'act',
    origin: 'raw-tcp-client',
    track: [],
    time: { client_sent: Date.now() },
    act: { role: 'color', cmd: 'hex', name: 'blue' },
    sync: true,
  }
  socket.write(JSON.stringify(request) + '\n')
})

// Responses are newline delimited: collect data until a full line arrives.
let buffer = ''
socket.setEncoding('utf8')
socket.on('data', function (chunk) {
  buffer += chunk
  const end = buffer.indexOf('\n')
  if (-1 === end) return
  console.log(JSON.parse(buffer.slice(0, end)))
  socket.end()
  service.close()
})

socket.on('error', function (err) {
  console.error('ERROR', err.message)
  process.exitCode = 1
  service.close()
})
```

```
$ node raw-tcp-client.js
{
  id: 'request-1/transaction-1',
  kind: 'res',
  origin: 'raw-tcp-client',
  accept: '8nm49wjj6rvv/1791442427939/10436/4.0.0-rc5/service',
  track: [],
  time: {
    client_sent: 1791442428074,
    listen_recv: 1791442428076,
    listen_sent: 1791442428077
  },
  sync: true,
  res: { name: 'blue', hex: '#0000FF' }
}
```

`id` must be a string of the form `mi/tx` (any two tokens), `kind`
must be `act`, and `sync: true` asks for a response. On failure the
response has `res: null`, an `error` object and the `input`. A line
that is not JSON closes the connection. The fields are specified in the
[TCP protocol reference](../reference/tcp-protocol.md).

## Keep it private

Whatever the transport, every pattern the listening instance knows is
callable, including `sys:seneca,cmd:close`; see
[Security](../reference/http-protocol.md#security).
