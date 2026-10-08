# Utilities reference: `transport/utils`

The plugin exports the object it uses to build its own `web` and `tcp`
transports, so that other transport plugins (message queues, pub/sub)
can reuse the envelope handling, the call map and the loop checks:

```js
const tu = seneca.export('transport/utils')
```

The export is registered under the plugin's export key `utils`
(`exportmap: { utils }`). During the plugin's preload a placeholder
function is registered under the same key; once the plugin's definition
has run, the key holds the utilities object. On Seneca 4 the core has
its own `transport/utils` object (`externalize_msg`, `internalize_reply`
and so on); loading this plugin replaces it.

The object is an instance of the class in `lib/transport-utils.js`,
created as `new TransportUtil({ callmap, seneca, options })` where
`callmap` is the LRU cache (`lru-cache`, `{ max: options.callmax }`),
`seneca` the plugin's instance and `options` the plugin options. The
tests create their own instances this way.

A complete transport built on these helpers is in
[memory-transport.js](../examples/memory-transport.js), explained in
[Write a transport plugin](../how-to/write-a-transport-plugin.md).

## Listener side

### `handle_request(seneca, data, listen_options, respond)`

Processes an inbound request envelope `data` and calls `respond(out)`
with the response envelope. Steps: reject when `data` is missing
(`no_data`), set the delegate's transaction id from the `tx` part of
`data.id`, reject `kind !== 'act'` (`invalid_kind_act`), `id === null`
(`no_message_id`), an `id` present in the call map when
`check.own_message` (`own_message`), the instance's own id in
`data.track` when `check.message_loop` (`message_loop`), and an `error`
property (`data_error`). Then build the response with
`prepareResponse`, convert `entity$` objects in `data.act` with
`handle_entity`, set `act.transport$ = { track, origin, time }` and
`act.id$ = data.id`, and run `requestAct`. On rejection `respond`
receives `{ input: data, error }` (an eraro error object; no `id`).

`seneca` should be a delegate of the listening instance
(`this.root.delegate()` in the hook), because the transaction id is set
on its `fixedargs`.

### `requestAct(seneca, input, output, respond)`

Calls `seneca.act(input, ...)`, completes `output` with `update_output`
when the action replies and calls `respond(output)`. If `act` throws,
`catch_act_error` records the error and `respond` is still called.

### `prepareResponse(seneca, input)`

Returns the response envelope skeleton for request `input`:
`{ id, kind: 'res', origin, accept: seneca.id, track, time: { client_sent, listen_recv: Date.now() }, sync }`.

### `update_output(input, output, err, out)`

Sets `output.res = out`; when `err` is set, `output.error =
serializeError(err)` and `output.input = input`; sets
`output.time.listen_sent`.

### `catch_act_error(seneca, e, listen_options, input, output)`

Logs `listen act-error` and sets `output.error = serializeError(e)` and
`output.input = input`.

### `serializeError(err)`

Returns a plain object with every own enumerable property of `err`
except `meta$`, plus `message` and `name` (default `'Error'`). If that
object cannot be JSON stringified, returns `{ message, name, code }`
only. Also available as a static function on the module.

### `listen_topics(seneca, args, listen_options, [do_topic])`

Resolves the pins of configuration `args` (`pin` or `pins`) with
`resolve_pins`, finds the local patterns matching them
(`seneca.findpins`) and returns one topic name per pattern:
`msgprefix` followed by the pattern's `key=value,` pairs in key order
with non-word characters replaced by `_`, for example
`seneca_cmd_hex_role_color_`. Without pins the single topic is
`msgprefix + 'any'`. `do_topic(topic)` is called for each topic when
given. Only patterns that exist when `listen` is called are found, so
add actions before listening. The `web` and `tcp` transports do not use
topics.

## Client side

### `make_client(seneca, make_send, client_options, done)`

Builds the client object the client hook replies with. `make_send(spec,
topic, send_done)` is called by the plugin, once per topic, to obtain
the `send(msg, reply, meta)` function for that topic (`spec` is `{ pin
}` for the matching pin, `{}` without pins). With pins, messages are
matched to pins with a Patrun router (`make_argspatrun`), the topic is
derived from the message (`resolve_topic`) and `send` functions are
cached per topic (`make_resolvesend`); without pins a single `send` for
`msgprefix + 'any'` is used (`make_anyclient`). `done(err, client)`
receives `{ id, send, toString }`.

The legacy three argument form `make_client(make_send, client_options,
done)` uses the plugin's own instance. `client_options.id` must be set
(the core's `client()` always sets it); without it the pinned client
fails with `ReferenceError: self is not defined`.

### `prepare_request(seneca, msg, done, meta)`

Builds the request envelope for `msg` and registers the callback.
`meta` is `msg.meta$` (Seneca 3 with `legacy.meta`) or the meta argument
(Seneca 4); `meta.sync` defaults to `true`. For a sync message the
callback is stored in the call map under `meta.id`; otherwise it is
called at once with `(null, null, null)`. The `track` is the inbound
`msg.transport$.track` (copied) plus `seneca.id`. Returns
`{ id, kind: 'act', origin: seneca.id, track, time: { client_sent }, act: seneca.util.clean(msg), sync, msg$ }`,
with `act.custom$ = meta.custom` when custom meta data exists.
Call it with the acting instance as `seneca` (the `this` of the `send`
function). Known limitation: copying an inbound `track` uses
`seneca.util.deep`, which turns the array into an object, so relaying an
inbound message object fails with `track.push is not a function`.

### `handle_response(seneca, data, client_options)`

Processes a response envelope `data`: sets `data.time.client_recv`;
drops it (returning `false`, with a warning when enabled) when `kind !==
'res'`, `id === null` or `origin !== seneca.id`; rebuilds an `Error`
from `data.error` (message plus every property); converts `entity$`
objects in `data.res` with `handle_entity`; for `sync: false` returns
`true` without calling anything (an error is logged as
`unexcepted_async_error`); looks up the call map entry for `data.id`,
removes it (or drops the response with `unknown_message_id`), and calls
the stored callback with `(err, result, { id, accept, track, time })`
through `callmeta`. Returns `true` when the response was consumed.

### `callmeta({ callmeta, err, result, actinfo, seneca, client_options, data })`

Calls `callmeta.done(err, result, actinfo)` and logs `client
callback_error` if the callback throws.

### `resolve_pins(opts)`

Returns `opts.pin || opts.pins` as an array of pattern objects (strings
are parsed with Jsonic), or `undefined`.

### `make_argspatrun(pins)`

Returns a Patrun router (`{ gex: true }`) with `{ pin }` under each
pin, and a `mark` string describing the pins.

### `make_resolvesend(opts, sendmap, make_send)`

Returns `resolvesend(spec, msg, done)`, which derives the topic for
`msg`, reuses the `send` in `sendmap[topic]` or obtains one from
`make_send(spec, topic, cb)`.

### `resolve_topic(opts, spec, msg)` (legacy alias `resolvetopic`)

Returns the topic for a message: `msgprefix + 'any'` without a pin, else
`msgprefix` followed by the `key=value,` pairs of the pin's keys taken
from the message, in key order, non-word characters replaced by `_`.

### `make_anyclient(opts, make_send, done)` and `make_pinclient(opts, resolvesend, argspatrun, done)`

The two client object builders used by `make_client`; `make_anyclient`
fails with `null-client` when `make_send` does not supply a function.

## Shared helpers

### `close(seneca, closer)`

Adds a prior on the close action (`closePattern(seneca)`) that calls
`closer(done)` and then the prior. Register one per listener or client
to release sockets when the instance closes.

### `closePattern(seneca)`

`'role:seneca,cmd:close'` when `seneca.version` starts with `0.` to
`3.`, else `'sys:seneca,cmd:close'`.

### `handle_entity(seneca, raw)`

Converts `raw` into an entity when it has an `entity$` property, and
converts first level property values marked `entity$`, using
`seneca.make$`. Requires the entity plugin (seneca-entity) to be loaded
on the instance; without it, data with `entity$` makes the call fail
with `seneca.make$ is not a function`. Returns `raw` unchanged when it
is not an object.

### `stringifyJSON(seneca, note, obj)` and `parseJSON(seneca, note, str)`

`JSON.stringify` and `JSON.parse` that log a warning (`json-stringify`,
`json-parse`, with `note`) instead of throwing. `parseJSON` returns the
error object (with `input` set to the string) on failure; both return
`undefined` for empty input.

### `resolveDynamicValue(value, options)`

Returns `value(options)` when `value` is a function, else `value`. Used
for `port`, `host` and `path` of the `web` transport.

### `error(code, details)`

The eraro error factory with the plugin's message templates (see
[Errors](errors.md)).
