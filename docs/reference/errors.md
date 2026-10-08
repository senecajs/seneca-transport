# Error codes reference

Errors created by the plugin are made with [eraro](https://github.com/rjrodger/eraro)
under the package name `seneca`: they have `code`, `message` (the
template below, prefixed with `seneca: `), `details`, `seneca: true`,
`package: 'seneca'` and `msg`. The factory is available as
`seneca.export('transport/utils').error(code, details)`.

## Codes defined by the plugin

| Code | Message | Raised when | How it surfaces |
| ---- | ------- | ----------- | --------------- |
| `no_data` | The message has no data. | A listener's `handle_request` is called with no envelope. | Error response (HTTP 500 body, TCP error envelope). Not reachable through the HTTP and TCP listeners, which always pass an object. |
| `invalid_kind_act` | Inbound messages should have kind "act", kind was: `<kind>`. | An inbound envelope's `kind` is not `act`. HTTP requests always get `kind: act`, so this concerns TCP and custom transports. | Error response; `invalid_kind_act` warning when `warn.invalid_kind`. |
| `no_message_id` | The message has no identifier. | An inbound envelope has `id: null`. | Error response; `no_message_id` warning when `warn.no_message_id`. |
| `invalid_origin` | The message response is not for this instance, origin was `<origin>`. | Defined for responses whose `origin` is another instance. The client drops such a response and logs an `invalid_origin` warning; the error object itself is not delivered, so the caller sees an `action_timeout`. |
| `unknown_message_id` | The message has an unknown identifier | Defined for responses whose `id` is not in the call map (already answered, evicted by `callmax`, or never sent). The response is dropped with an `unknown_message_id` warning; the caller sees an `action_timeout`. |
| `own_message` | Inbound message rejected as originated from this server. | `check.own_message` is on and the inbound `id` is in this instance's own call map. | Error response; `own_message` warning when `warn.own_message`. |
| `message_loop` | Inbound message rejected as looping back to this server. | `check.message_loop` is on and this instance's id is in the inbound `track`. | Error response; `message_loop` warning when `warn.message_loop`. |
| `data_error` | Inbound message included an error description. | An inbound request envelope carries an `error` property. | Error response; `data_error` log entry at level error. |
| `invalid_json` | Invalid JSON: `<input>`. | The HTTP request body is not valid JSON (`details.input` is the body). | HTTP 500 with the error as body (the `json-parse` warning is logged too). The TCP listener defines the same response but its parser closes the connection on a bad line before the code is reached. |
| `unexcepted_async_error` | Unexcepted error response to asynchronous message. | A response to a `sync: false` message carries an error. | Warning only; nothing is delivered. |

On the client, an error response becomes an `Error` with the same
`code`, `message` and `details` (see
[Errors on the wire](../explanation/errors-on-the-wire.md)). An error
envelope produced by the listener itself is stringified directly, so
its JSON body has `msg` but no `message` property; such a body reaches a
Seneca client as an error with an empty `message` and the `code` set.

## Codes created with `seneca.fail`

| Code | Raised when | Details |
| ---- | ----------- | ------- |
| `plugin-needed` | `listen` or `client` is called with `type: 'pubsub'` or `type: 'queue'`. | `{ name: 'seneca-redis-transport' }` or `{ name: 'seneca-beanstalkd-transport' }`. Fatal (`transport_listen` or `transport_client`). |
| `null-client` | `make_client` is used without pins and the `make_send` function does not supply a `send` function. | `{ opts }`. Only reachable from custom transports. |

## Log entries that are not errors

These are written with `seneca.log.warn` or `seneca.log.error` and do
not produce an error object:

| Entry | Level | When |
| ----- | ----- | ---- |
| `client invalid_kind_res` | warn | A response's `kind` is not `res` (`warn.invalid_kind`). |
| `client callback_error` | error | The caller's callback threw while handling a response. |
| `listen attempt <n> EADDRINUSE` | warn | A listener retries after `EADDRINUSE`. The entry contains the full listen configuration, including `serverOptions` (keys and certificates). |
| `listen net-error` | error | A TCP listener's socket error. |
| `listen pipe-error` | error | A TCP connection error. |
| `listen act-error` | error | `seneca.act` threw while handling an inbound message. |
| `json-stringify`, `json-parse` | warn | A value could not be stringified or parsed. |
| `listen data_error` | error | See `data_error` above. |

## Errors from Seneca core and libraries

| Error | Where | Meaning |
| ----- | ----- | ------- |
| `transport_listen` | core, fatal | `seneca.listen` failed (for example `EADDRINUSE` after the retries, or `plugin-needed`). The process exits with code 1. |
| `transport_client` | core, fatal | `seneca.client` failed. |
| `transport_client_null` | core, fatal | The client hook replied with nothing. |
| `action_timeout` | core | The remote call did not complete within the Seneca `timeout` (22222 ms by default), for whatever reason: slow action, dropped response, listener that never bound its port. |
| `act_not_found` | core, remote | No action on the listening instance matches the message. Travels back like any other error. |
| `Client request timeout` | HTTP client (Wreck), no `code` | The `web.timeout` elapsed. |
| `Response Error: <status> <reason>` | HTTP client (Wreck), no `code`; `err.output.statusCode` is the status | A non-2xx response without the `seneca-kind: res` header: from a proxy, a server that is not a Seneca listener, or a wrong `path` (`Response Error: 404 Not Found`). The call fails at once. |
| `Client request error: <reason>` | HTTP client, no `code`; `err.code` may be a Node.js code such as `ECONNREFUSED` or `DEPTH_ZERO_SELF_SIGNED_CERT` | The request could not be made (connection refused, TLS failure). |

See the core [Error codes reference](https://github.com/senecajs/seneca/blob/master/docs/reference/error-codes.md)
for the core codes.
