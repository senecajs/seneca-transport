# HTTP protocol reference

What a `web` (`http`, `direct`) listener accepts and answers, and what
a `web` client sends. The envelope fields are explained in
[How a message travels](../explanation/message-lifecycle.md) and in the
core [Message transport protocol](https://github.com/senecajs/seneca/blob/master/docs/reference/message-transport-protocol.md).
The `curl` outputs on this page were captured against
[protocol-service.js](../examples/protocol-service.js), the `color`
plugin of the examples plus two actions (`slow` and `detail`),
listening on port 8280:

```
$ node protocol-service.js
protocol service listening on port 8280 as 9n3adn54mxnp/1791443865393/25365/4.0.0-rc5/protocol
```

## Request

A Seneca client sends `POST <protocol>://<host>:<port><path>` (default
path `/act`) with these headers, captured by a plain Node.js server:

| Header | Value |
| ------ | ----- |
| `Accept` | `application/json` |
| `Content-Type` | `application/json` |
| `seneca-id` | The message id, `mi/tx`, for example `om2iglkqlspi/g0q99tv319u6`. |
| `seneca-kind` | `req` |
| `seneca-origin` | The sending instance id, for example `9mnxhxjc1t43/1791407450634/26401/4.0.0-rc5/client`. |
| `seneca-track` | The `track` array as JSON, for example `["9mnxhxjc1t43/1791407450634/26401/4.0.0-rc5/client"]`. |
| `seneca-time-client-sent` | Timestamp in milliseconds. |
| `Content-Length`, `Host`, `Connection: close` | Added by the HTTP library. Each request uses its own connection. |

Extra headers from the plugin option `web.headers` are added; the
reserved names listed in [Options](options.md#web) are removed from it.

The body is the message without its `$` directives, plus `custom$`
with the custom meta data:

```json
{"role":"color","cmd":"hex","name":"red","custom$":{}}
```

### Requests from other clients

A request without a `seneca-id` header is treated as a plain message:
the listener generates an id and uses the `User-Agent` header (or
`UNKNOWN`) as origin. Any method works; the body may be empty. The
message is assembled from, in increasing precedence:

1. the JSON body (an object);
2. the query parameter `args$`, parsed as [Jsonic](https://github.com/jsonicjs/jsonic) (deprecated);
3. the query parameter `msg$`, parsed as Jsonic;
4. the other query parameters, parsed with `qs` (values are strings).

```
$ curl -s 'http://127.0.0.1:8280/act?role=color&cmd=hex&name=green'
{"name":"green","hex":"#00FF00"}
$ curl -s 'http://127.0.0.1:8280/act?msg$=role:color,cmd:list'
{"names":["red","green","blue"]}
$ curl -s 'http://127.0.0.1:8280/act?role=color&cmd=slow&ms=100'
{"slept":"100"}
```

The last line shows that query values arrive as strings. A request that
sends `seneca-id`, `seneca-origin` and `seneca-track` headers is treated
as a Seneca request and gets them echoed:

```
$ curl -s -i -X POST http://127.0.0.1:8280/act -H 'seneca-id: abc/def' -H 'seneca-origin: curl' -H 'seneca-track: []' -d '{"role":"color","cmd":"list"}'
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=0, no-cache, no-store
Content-Length: 32
seneca-id: abc/def
seneca-kind: res
seneca-origin: curl
seneca-accept: 9n3adn54mxnp/1791443865393/25365/4.0.0-rc5/protocol
seneca-track:
seneca-time-client-sent: 0
seneca-time-listen-recv: 0
seneca-time-listen-sent: 0
Date: Thu, 08 Oct 2026 07:17:45 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"names":["red","green","blue"]}
```

## Response

```
$ curl -s -i -X POST http://127.0.0.1:8280/act -H 'Content-Type: application/json' -d '{"role":"color","cmd":"hex","name":"red"}'
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, max-age=0, no-cache, no-store
Content-Length: 30
seneca-id: ddhwuq3txp2r
seneca-kind: res
seneca-origin: curl/8.5.0
seneca-accept: 9n3adn54mxnp/1791443865393/25365/4.0.0-rc5/protocol
seneca-track:
seneca-time-client-sent: 0
seneca-time-listen-recv: 0
seneca-time-listen-sent: 0
Date: Thu, 08 Oct 2026 07:17:45 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"name":"red","hex":"#FF0000"}
```

| Header | Value |
| ------ | ----- |
| `Content-Type` | `application/json` |
| `Cache-Control` | `private, max-age=0, no-cache, no-store` |
| `Content-Length` | Body length. |
| `seneca-id` | The request id (generated for non-Seneca requests). For an error produced by the listener itself (`invalid_json`, `message_loop`) it is the listener's instance id. |
| `seneca-kind` | `res`. A Seneca client relies on it to tell a listener's error response from any other non-2xx response. |
| `seneca-origin` | The request's origin, or `UNKNOWN`. |
| `seneca-accept` | The listening instance id. |
| `seneca-track` | The request's `track` joined with commas (not JSON); empty when the track is empty. |
| `seneca-time-client-sent`, `seneca-time-listen-recv`, `seneca-time-listen-sent` | Always `0` in version 8.4. |

The body is the result as JSON; `null` when the action replied with
nothing.

### Status codes

| Status | When | Body |
| ------ | ---- | ---- |
| `200` | The action replied with a result (or nothing). | The result, or `null`. |
| the result's `statusCode` | The result object has a `statusCode` property. A Seneca client treats any status other than 200 as an error. | The result. |
| the error's `statusCode`, else `500` | The action replied with or threw an error. | The flattened error: its plain properties, `message` and `name`. |
| `500` | The listener rejected the envelope: `invalid_json`, `message_loop`, `own_message`, `invalid_kind_act`, `no_message_id`, `data_error`. | The error as JSON (`code`, `msg`, `details`, ...; no `message` property). |
| `404` | The URL path is not the configured `path`. Sent without `seneca-*` headers, so a Seneca client fails with `Response Error: 404 Not Found`. | Empty. |
| `503 Response timeout` | Defined for the listener timeout; not reached in practice (see Timeouts). | `{ "code": "ETIMEDOUT" }` |

Examples (headers after the status line shortened to `...` where they
are as above):

```
$ curl -s -i -X POST http://127.0.0.1:8280/act -d '{"role":"color","cmd":"hex","name":"pink"}'
HTTP/1.1 500 Internal Server Error
...
{"eraro":true,"orig":null,"code":"unknown_color","seneca":true,"package":"seneca","msg":"seneca: Unknown color: pink.","details":{"name":"pink"},"callpoint":"at Seneca.error (/home/user/seneca-transport/node_modules/seneca/lib/api.js:128:32)","message":"seneca: Unknown color: pink.","name":"Error"}

$ curl -s -i -X POST http://127.0.0.1:8280/act -d '{"role":"color","cmd":"detail","name":"pink"}'
HTTP/1.1 404 Not Found
...
{"code":"not_found","statusCode":404,"details":{"name":"pink"},"callpoint":"at Seneca.<anonymous> (/home/user/seneca-transport/docs/examples/protocol-service.js:24:17)","message":"not found: pink","name":"Error"}

$ curl -s -i -X POST http://127.0.0.1:8280/act -d '{not json'
HTTP/1.1 500 Internal Server Error
...
seneca-id: 9n3adn54mxnp/1791443865393/25365/4.0.0-rc5/protocol
seneca-kind: res
seneca-origin: UNKNOWN
...
{"eraro":true,"orig":null,"code":"invalid_json","seneca":true,"package":"seneca","msg":"seneca: Invalid JSON: {not json.","details":{"input":"{not json"},"callpoint":"at IncomingMessage.<anonymous> (/home/user/seneca-transport/lib/http.js:259:35)"}

$ curl -s -i -X POST http://127.0.0.1:8280/act
HTTP/1.1 500 Internal Server Error
...
{"eraro":true,"orig":null,"code":"act_not_found","seneca":true,"package":"seneca","msg":"seneca: No matching action pattern found for {}, and no default result provided (using a default$ property).","details":{"args":"{}"},"callpoint":"at Object.handle_inward_break (/home/user/seneca-transport/node_modules/seneca/lib/act.js:289:49)","message":"seneca: No matching action pattern found for {}, and no default result provided (using a default$ property).","name":"Error"}

$ curl -s -i http://127.0.0.1:8280/other -d '{"role":"color","cmd":"list"}'
HTTP/1.1 404 Not Found
Date: Thu, 08 Oct 2026 07:17:45 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 0
```

The empty request has the message `{}`, which matches no action.

## How the client reads a response

The `web` client (`@hapi/wreck`) handles the response as follows:

* Status `200`: the body (a JSON object) is the result; a body that is
  not an object gives `null`.
* A non-2xx status with the header `seneca-kind: res` (every response
  of a Seneca listener has it): the body is an error description; the
  client builds an `Error` from its `message` and copies its other
  properties, so the caller sees the remote error.
* A non-2xx status without `seneca-kind: res` (a proxy, a server that is
  not a Seneca listener, the listener's own `404` for a wrong path): the
  call fails at once with the HTTP client's error. Its message is
  `Response Error: <status> <reason>`, for example
  `Response Error: 502 Bad Gateway` or `Response Error: 404 Not Found`;
  it has no `code`, and `err.output.statusCode` holds the status.
* Another 2xx status (for example a result with `statusCode: 201`): the
  body is read as an error description, as for a Seneca error response.
* The response headers `seneca-id` and `seneca-origin` must echo the
  request's values: a `200` (or other 2xx) response whose
  `seneca-origin` is not the sending instance is dropped with an
  `invalid_origin` warning and the caller gets an `action_timeout`. A
  server that answers Seneca clients without this plugin has to echo
  these two headers, and add `seneca-kind: res` to error responses.
* A failed request (connection refused, TLS failure, timeout) produces
  the library's error: `Client request error: <reason>` (with `code`
  set to the Node.js error code, such as `ECONNREFUSED`) or
  `Client request timeout`.

[answer-seneca-clients.js](../examples/answer-seneca-clients.js) runs a
plain Node.js server that answers a Seneca client in four of these ways
(client `timeout` 1500 ms):

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

The `undefinedAction` in the timeout message is how Seneca 4 words it.

## Timeouts

Three timeouts apply to a remote call; see
[Tune timeouts, retries and message checks](../how-to/tune-timeouts-retries-and-message-checks.md).

* The client's `timeout` (configuration key or `web.timeout`, default
  5555 ms) is the HTTP request timeout: `Client request timeout`.
* The Seneca `timeout` option of the client instance (default 22222 ms)
  bounds the whole call: `action_timeout`.
* The listener's `timeout` (`web.timeout`, default 5555 ms) starts a
  timer that would answer `503 Response timeout` with body
  `{ "code": "ETIMEDOUT" }`. The timer is cleared when the request's
  `close` event fires or data arrives on the socket, and on Node.js 16
  and later `close` fires as soon as the request body has been read,
  before the action runs. Do not rely on this timeout. On Node.js 24,
  with the default 5555 ms:

  ```
  $ time curl -s -i -X POST http://127.0.0.1:8280/act -d '{"role":"color","cmd":"slow","ms":7000}'
  HTTP/1.1 200 OK
  ...
  {"slept":7000}
  real	0m7.009s
  ```

## HTTPS

Set `protocol: 'https'` and `serverOptions` (passed to
`https.createServer`) on the listener and `protocol: 'https'` on the
client. The client has no TLS options of its own; it trusts the
process's certificate authorities, so for a self-signed certificate set
`NODE_EXTRA_CA_CERTS` (see [Use HTTPS](../how-to/use-https.md)).

## Security

* The listener checks the URL path and nothing else. The `pin` of a
  `listen` call is not applied to inbound messages: every pattern the
  listening instance can handle is callable, including the builtin
  `sys:seneca,cmd:ping` and `sys:seneca,cmd:close`. One request shuts
  a listener down; protocol-service.js (pin `role:color,cmd:*`) then
  refused connections (`curl` exit code 7) and, with nothing else
  keeping it alive, its process exited with code 0:

  ```
  $ curl -s -X POST http://127.0.0.1:8280/act -d '{"sys":"seneca","cmd":"close"}'
  null
  $ curl -s -X POST http://127.0.0.1:8280/act -d '{"role":"color","cmd":"list"}'; echo "curl exit code $?"
  curl exit code 7
  ```
* The response headers reveal the listening instance id; error bodies
  contain `callpoint` with file paths of the service.
* The `listen attempt` warnings written during `EADDRINUSE` retries
  contain the full listen configuration, including `serverOptions`
  (keys and certificates).

Expose listeners only on trusted networks, or behind a proxy that
restricts paths and bodies.

## Notes

* Node.js 24 prints a `DEP0169` deprecation warning about `url.parse()`
  the first time a listener handles a request. It is harmless.
* This plugin (versions 8.x) and Seneca 3's own `web` transport (used
  when `legacy.transport` is false) both post to `/act`, but the Seneca
  3 core format puts the meta data in a `meta$` body property; the two
  formats are not interchangeable.
