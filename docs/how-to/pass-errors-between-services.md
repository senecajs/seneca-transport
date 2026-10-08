# Pass errors between services

Goal: know what an error replied by a remote action looks like on the
calling side, and design actions accordingly. The program is
[errors.js](../examples/errors.js); the reasoning is in
[Errors on the wire](../explanation/errors-on-the-wire.md).

## 1. Reply with errors on the service

```js
const service = Seneca({ tag: 'service', log: 'fatal' })
  .use('@seneca/transport')
  .use(color)                                   // replies this.error('unknown_color', { name })
  .add('role:color,cmd:plain', function (msg, reply) {
    reply(new Error('a plain error'))
  })
  .add('role:color,cmd:detail', function (msg, reply) {
    const err = new Error('not found: ' + msg.name)
    err.code = 'not_found'
    err.statusCode = 404 // becomes the HTTP status of the response
    err.details = { name: msg.name, tried: ['red', 'green', 'blue'] }
    reply(err)
  })
  .add('role:color,cmd:throw', function () {
    throw new Error('thrown in the action')
  })
  .listen({ type: 'web', port: 8275, pin: 'role:color,cmd:*' })
  .listen({ type: 'tcp', port: 8276, pin: 'role:color,cmd:*' })
```

`log: 'fatal'` hides the error log entries each failed action produces
on both instances; with the default level you see them as JSON lines.

## 2. Catch them on the client

For each message (the loop and the final `client.close()` and
`service.close()`, in a `finally` block, are in the file):

```js
try {
  await client.post(msg)
  console.log(msg, 'unexpectedly succeeded')
} catch (err) {
  console.log(msg)
  console.log('  message:', JSON.stringify(err.message))
  console.log('  code:', err.code, '| statusCode:', err.statusCode, '| name:', err.name)
  console.log('  details:', JSON.stringify(err.details))
  console.log('  properties:', Object.keys(err).join(', '))
}
```

```
$ node errors.js
role:color,cmd:hex,name:pink
  message: "seneca: Unknown color: pink."
  code: unknown_color | statusCode: undefined | name: Error
  details: {"name":"pink"}
  properties: eraro, orig, code, seneca, package, msg, details, callpoint, name
role:color,cmd:plain
  message: "a plain error"
  code: undefined | statusCode: undefined | name: Error
  details: undefined
  properties: callpoint, name
role:color,cmd:detail,name:pink
  message: "not found: pink"
  code: not_found | statusCode: 404 | name: Error
  details: {"name":"pink","tried":["red","green","blue"]}
  properties: code, statusCode, details, callpoint, name
role:color,cmd:throw
  message: "thrown in the action"
  code: undefined | statusCode: undefined | name: Error
  details: undefined
  properties: callpoint, name
```

The first three went over HTTP, the last over TCP; the shape is the
same. What arrives: `message`, `name`, `code`, `details`, `statusCode`
and every other plain property (`eraro`, `seneca`, `package`, `msg` for
errors made with `seneca.error`/`seneca.fail`; `callpoint` is added by
Seneca 4). What does not: the stack trace, and the Seneca 4 `meta$`.

## 3. Mind the HTTP status

Over HTTP the error's `statusCode` (default 500) becomes the response
status, which non-Seneca clients can use.
[protocol-service.js](../examples/protocol-service.js) has the same
`detail` action and keeps running:

```
$ curl -s -i -X POST http://127.0.0.1:8280/act -d '{"role":"color","cmd":"detail","name":"pink"}'
HTTP/1.1 404 Not Found
...
{"code":"not_found","statusCode":404,"details":{"name":"pink"},"callpoint":"at Seneca.<anonymous> (/home/user/seneca-transport/docs/examples/protocol-service.js:24:17)","message":"not found: pink","name":"Error"}
```

Do not put a `statusCode` on *results*: it sets the response status too,
and a Seneca client treats any status other than 200 as an error.

## 4. Recognise errors that did not come from the service

The client rebuilds the remote error only from responses marked with the
`seneca-kind: res` header, which every response of a Seneca listener
carries. A non-2xx response without it (from a proxy or load balancer,
or a `404` because the client's `path` is wrong) fails the call at once
with the HTTP client's error: `err.message` is `Response Error: <status>
<reason>`, for example `Response Error: 502 Bad Gateway`, `err.code` is
undefined and `err.output.statusCode` holds the status. Connection
failures look similar: `Client request error: connect ECONNREFUSED
127.0.0.1:8270`, with `err.code` set to the Node.js code.

## 5. Handle `details` with care

`details` must survive `JSON.stringify`. If it cannot (a circular
reference, for example), only `message`, `name` and `code` are sent and
`details` is `undefined` on the client.

## 6. Seneca 3 callers

On Seneca 3, errors that are not Seneca errors arrive wrapped:
`err.message` is `seneca: Action <pattern> failed: a plain error.`,
`err.code` is `act_execute` and the remote message is in
`err.details.message`. Errors made with `seneca.error` or `seneca.fail`
keep their own code and message on both versions. Code that must run
on both can use `err.code` for Seneca errors and
`(err.details && err.details.message) || err.message` for the text.

## 7. Prefer results for expected failures

An unknown item is not exceptional. Replying
`{ ok: false, why: 'unknown_color', name: msg.name }` avoids error
handling on both sides, keeps HTTP status 200, and is the same on every
Seneca version.
