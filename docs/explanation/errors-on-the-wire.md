# Errors on the wire

An error replied by a remote action has to become JSON, travel, and
become an `Error` again. This page explains what the plugin keeps, what
it drops, and why.

## What travels

`Error` objects do not serialize well: `message`, `name` and `stack`
are not enumerable, so `JSON.stringify(new Error('x'))` is `{}`. On
Seneca 4 an error replied by an action also carries `meta$`, the full
meta data of the failed action, which is large and may contain
references that cannot be serialized at all. Before version 8.4 this
made error replies fail to stringify: HTTP clients saw a generic
`Response Error: 500 Internal Server Error` and TCP clients timed out.

Version 8.4 flattens the error into a plain object before it is sent:

1. every own enumerable property except `meta$` (typically `code`,
   `details`, `statusCode`, and for errors made by `seneca.error` or
   `seneca.fail` also `eraro`, `seneca`, `package`, `msg`, `callpoint`);
2. `message`;
3. `name` (`Error` when the error has none).

If the result still cannot be stringified (for example `details` with a
circular reference), only `message`, `name` and `code` are sent. The
stack trace never travels: it describes the service process and would
be misleading on the client.

On the client, `handle_response` creates `new Error(message)` and copies
every property of the flat object onto it. So after the hop you have
the message, the name, the code, the details and any other plain
property, and nothing else. Seneca 4 adds `callpoint` to errors it
handles, which is why `callpoint` appears among the properties on both
sides.

## What the transport adds

Over HTTP the error decides the status: `error.statusCode` if the
error has one, else 500. The body is the flat error object. Over TCP
the response envelope carries the flat error in `error` and the original
`act` in `input`, with `res: null`.

The HTTP client treats every status other than 200 as an error. For a
response from a Seneca listener, marked by the `seneca-kind: res`
header, it rebuilds the error from the body. A non-2xx response without
that header did not come from the service (a proxy, another server, a
wrong `path`), so its body is not taken as an error description: the
call fails at once with the HTTP client's own error,
`Response Error: <status> <reason>`.

Treating every status other than 200 as an error has one surprising
consequence: a *result* object with a `statusCode` property sets the
status of the response (the listener uses `out.res.statusCode`), so a
result `{ statusCode: 201, created: true }` reaches `curl` as `201
Created` but reaches a Seneca client as an error with an empty message
and the result's properties. Over TCP the same result arrives as a
normal result. Keep `statusCode` out of results unless the only callers
are non-Seneca HTTP clients.

## What Seneca does with it

On Seneca 4 the rebuilt error is passed to the caller unwrapped:
`err.message` is the remote message, `err.code` the remote code. The
Seneca wrapper (`act_execute`, "Action ... failed") is only visible to
the error handler as `err.meta$.err`. On Seneca 3 an error that is not
a Seneca error (no `eraro` property) is wrapped: `err.message` becomes
`seneca: Action <pattern> failed: <message>.`, `err.code` is
`act_execute` and the remote message is in `err.details.message`;
errors created with `seneca.error` or `seneca.fail` keep their code and
message on both versions. See
[Pass errors between services](../how-to/pass-errors-between-services.md)
for the output of a real run.

Errors the transport itself produces follow the same path: a listener
rejecting an envelope (`message_loop`, `invalid_json`, ...) answers with
an error envelope that becomes an `Error` with that `code` on the
client; a failed HTTP request produces the HTTP library's error
(`Client request timeout`, `Client request error: ...`, or
`Response Error: ...` for an unmarked non-2xx response), whose `code`
is at most a Node.js error code such as `ECONNREFUSED`.

## Design advice

* Expected failures (unknown item, validation) are easier to handle as
  results: `reply({ ok: false, why: 'unknown_color' })` travels as data
  and needs no special casing on either side.
* When you do reply with an error, give it a `code` and plain JSON
  `details`; that is what survives the hop.
* Do not rely on `statusCode` in results, or on HTTP status codes other
  than 200 and 500 when Seneca clients call the service.
* Look at the service's log (`act/ERR` entries) for the stack trace;
  the client only gets the description.
