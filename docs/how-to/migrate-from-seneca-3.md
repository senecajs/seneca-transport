# Migrate from Seneca 3

Goal: move a system that uses `listen` and `client` from Seneca 3 to
Seneca 4 with version 9.0 of this plugin. The general migration of an
application is covered by the Seneca guide
[Migrate from Seneca 3](https://github.com/senecajs/seneca/blob/master/docs/how-to/migrate-from-seneca-3.md);
this page covers the transport.

## 1. Install and load the plugin

Seneca 4 does not bundle a transport. The plugin is published as
`@seneca/transport` from version 9.0.0; versions up to 8.3.0 were
published as `seneca-transport`, which Seneca 3 loads by itself.
Replace any `seneca-transport` dependency:

```sh
npm install seneca@^4 @seneca/transport@^9
```

Write `seneca@^4`: until Seneca 4.0.0 is the npm `latest` release, a
bare `seneca` installs Seneca 3. Seneca 4.0.0 and this plugin need
Node.js 24 or later. Then load the plugin

```js
seneca.use('@seneca/transport')
```

in every process that calls `listen` or `client`. Without it,
`listen` fails fatally (`transport_listen`: no action for
`role:transport,hook:listen,type:web`). Do not load `seneca-transport`
as well; see
[Choose the transport package for Seneca 3 or Seneca 4](run-on-seneca-3-and-4.md).

## 2. Remove Seneca 3 only options

Remove `legacy: { transport: ... }`: Seneca 4.0.0 ignores it and prints
a deprecation warning. `default_plugins: { transport: false }` is no
longer needed (Seneca 4 accepts and ignores it). The shared
`transport` block (`Seneca({ transport: { port, host, path, protocol,
web: {...}, tcp: {...} } })`) still works, with the caution about `path`
in step 6.

## 3. Know what 9.0 fixes

`seneca-transport` 8.3.0 loads on Seneca 4.0.0, but has these problems
there. Version 9.0 fixes or avoids them:

| On Seneca 4 with 8.3.0 | Cause | 9.0 |
| ---------------------- | ----- | --- |
| Remote errors arrive as `Response Error: 500 Internal Server Error` (HTTP) or as `action_timeout` (TCP) | Errors carry `meta$`, which could not be serialized. | Errors are flattened without `meta$`; the remote message, code and details arrive. |
| `type: 'http'` and `type: 'direct'` print the deprecation warning `SENECA_DEP_TRANSPORT_TYPE` | The core maps these names to `web` and deprecates them. | The same core warning; the plugin also resolves the names to its `web` options. Write `type: 'web'` (step 5). |
| Closing an instance prints the deprecation warning `SENECA_DEP_LEGACY_CLOSE_HOOK` | Close hooks were on `role:seneca,cmd:close`, the Seneca 3 pattern, which Seneca 4.0.0 still calls but deprecates. | Hooks on `sys:seneca,cmd:close`. |

Three more things change with the move:

* Use `type: 'web'`, not `http` or `direct` (step 5).
* For entities, load `@seneca/entity` 29 or later, not `seneca-entity`
  (step 7).
* Run on Node.js 24 or later.

## 4. Update error handling

Seneca 4 delivers remote errors unwrapped:

```js
// A plain Error replied by the remote action: reply(new Error('a plain error'))
// Seneca 3: the core wraps it; err.code is 'act_execute' and err.message
//           starts with 'seneca: Action <pattern> failed:'
// Seneca 4: err.message is 'a plain error', err.code is undefined
```

Errors made with `seneca.error` or `seneca.fail` keep their own code
and message on Seneca 4. Replace assertions on `seneca: Action ...
failed:` and on `err.orig` with `err.message` and `err.code`. HTTP
errors that do not come from a Seneca listener (a proxy's `502`, a
wrong `path`) fail the call at once with the HTTP client's error, for
example `Response Error: 502 Bad Gateway`.

## 5. Rename `type: 'http'` and `type: 'direct'` to `type: 'web'`

Seneca 4.0.0 still accepts them: the core maps them to `web` and prints
the deprecation warning `SENECA_DEP_TRANSPORT_TYPE`. Write `web`, the
name the options use.

## 6. Move HTTP paths out of the shared `transport` block

The core copies every scalar of `options.transport` into every `listen`
and `client` configuration, of any type. A `transport.path` meant for
HTTP therefore also reaches TCP listeners, which then listen on a UNIX
domain socket of that name instead of a port. Seneca 3 behaves the same;
it only shows once a process has both kinds of listener. Put HTTP paths
where only `web` reads them:

```js
Seneca({ transport: { web: { path: '/api' } } })      // core section for web
seneca.use('@seneca/transport', { web: { path: '/api' } })  // or the plugin option
```

## 7. Load `@seneca/entity` if messages carry entities

Entities travel as plain data with an `entity$` property. The
receiving side turns that data back into entities with `seneca.make$`,
which an entity plugin provides; this plugin only looks for
`seneca.make$` and does not depend on a particular entity package. On
Seneca 4 load `@seneca/entity` 29 or later (an optional peer
dependency, `^29.0.0`). Do not load `seneca-entity` 28: it is built
with Gubu, and Seneca 4.0.0 rejects it with the error
`plugin_gubu_shape`.

## 8. Replace Seneca 3 only API in your transport code

If you wrote code against `transport/utils`:

* `seneca.export('transport/utils')` is the plugin's object once the
  plugin is loaded. It also carries the Seneca 4 core helpers
  (`externalize_msg`, `externalize_reply`, `internalize_msg`,
  `internalize_reply`, `info`), so code written against the core export
  keeps working. Without the plugin it is the core's own helper set.
* `msg.meta$` is not attached to messages on Seneca 4 unless
  `legacy: { meta: true }`; the meta data is the third argument of
  actions, callbacks and `send` functions. `prepare_request` accepts
  either.
* `seneca.fixedargs` is named `seneca.fixedmsg` in Seneca 4.0.0. The
  old name remains as a deprecated alias that warns once.
* Close hooks: use `transportUtil.close(seneca, closer)`, which picks the
  right pattern.

## 9. Check

1. Start each service; `seneca.list('role:transport,hook:listen')` must
   list the hooks.
2. Call every remote pattern once, including one that fails, and check
   `err.message` and `err.code`.
3. Look for `SENECA_DEP_` deprecation warnings in the output and remove
   their causes.
4. Stop a service with SIGTERM and check that it exits with code 0 and
   releases its port (see [Shut down cleanly](shut-down-cleanly.md)).
