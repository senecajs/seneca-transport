# Migrate from Seneca 3

Goal: move a system that uses `listen` and `client` from Seneca 3 to
Seneca 4 with version 8.4 of this plugin. The general migration of an
application is covered by the Seneca guide
[Migrate from Seneca 3](https://github.com/senecajs/seneca/blob/master/docs/how-to/migrate-from-seneca-3.md);
this page covers the transport.

## 1. Install and load the plugin

Seneca 4 does not bundle a transport, and from version 8.4.0 the plugin
is published as `@seneca/transport` (versions up to 8.3.0 were
published as `seneca-transport`). Replace any `seneca-transport`
dependency:

```sh
npm install seneca@^4.0.0-rc5 @seneca/transport@^8.4.0
```

```js
seneca.use('@seneca/transport')
```

in every process that calls `listen` or `client`. Without it,
`listen` fails fatally (`transport_listen`: no action for
`role:transport,hook:listen,type:web`).

## 2. Remove Seneca 3 only options

Seneca 4 validates the `legacy` option strictly: remove
`legacy: { transport: ... }`. `default_plugins: { transport: false }` is
no longer needed (Seneca 4 accepts and ignores it). The shared
`transport` block (`Seneca({ transport: { port, host, path, protocol,
web: {...}, tcp: {...} } })`) still works, with the caution about `path`
in step 6.

## 3. Know what 8.4 fixes

Versions up to 8.3 have four problems on Seneca 4, all fixed in 8.4:

| Symptom on Seneca 4 with 8.3 | Cause | 8.4 |
| ---------------------------- | ----- | --- |
| `client({ type: 'http' })` fails with `Cannot read properties of undefined (reading 'headers')` | The core no longer maps `http`/`direct` to `web`. | The aliases resolve to the `web` options. |
| Processes do not exit after `close()` on 4.0.0-rc5 | Close hooks were on `role:seneca,cmd:close`, which rc5 never calls. | Hooks on `sys:seneca,cmd:close` on Seneca 4. |
| Remote errors arrive as `Response Error: 500 Internal Server Error` (HTTP) or as `action_timeout` (TCP) | Errors carry `meta$`, which could not be serialized. | Errors are flattened without `meta$`; the remote message, code and details arrive. |
| TCP listeners never bind their port on 4.0.0-rc5 | The core copies its HTTP default `path: '/act'` into TCP configurations, where a path means a UNIX socket. | That injected `/act` is ignored; the plugin's `tcp.path` is used if set, else the port. |

## 4. Update error handling

Seneca 4 delivers remote errors unwrapped:

```js
// A plain Error replied by the remote action: reply(new Error('a plain error'))
// Seneca 3: err.message is 'seneca: Action <pattern> failed: a plain error.',
//           err.code is 'act_execute', err.details.message is 'a plain error'
// Seneca 4: err.message is 'a plain error', err.code is undefined
```

Errors made with `seneca.error` or `seneca.fail` keep their code and
message on both. Replace assertions on `seneca: Action ... failed:` and
on `err.orig` with `err.message` and `err.code`. HTTP errors that do
not come from a Seneca listener (a proxy's `502`, a wrong `path`) fail
the call at once with the HTTP client's error, for example
`Response Error: 502 Bad Gateway`.

## 5. Keep or rename `type: 'http'` and `type: 'direct'`

They keep working as aliases of `web`. Prefer `web`, the name the
options use.

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

## 7. Set the host if you run on 4.0.0-rc5

Listeners bind `127.0.0.1` by default on the prerelease. Pass
`host: '0.0.0.0'` for services reachable from other machines.

## 8. Replace Seneca 3 only API in your transport code

If you wrote code against `transport/utils`:

* `seneca.export('transport/utils')` is the plugin's object on both
  versions once the plugin is loaded; on Seneca 4 without the plugin it
  is the core's different helper set.
* `msg.meta$` is not attached to messages on Seneca 4 unless
  `legacy: { meta: true }`; the meta data is the third argument of
  actions, callbacks and `send` functions. `prepare_request` accepts
  either.
* Close hooks: use `transportUtil.close(seneca, closer)`, which picks the
  right pattern.

## 9. Check

1. Start each service; `seneca.list('role:transport')` must list the
   hooks.
2. Call every remote pattern once, including one that fails, and check
   `err.message` and `err.code`.
3. Stop a service with SIGTERM and check that it exits with code 0 and
   releases its port (see [Shut down cleanly](shut-down-cleanly.md)).
