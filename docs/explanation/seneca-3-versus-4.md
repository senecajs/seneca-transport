# Seneca 3 versus 4

Version 8.4 of this plugin runs on Seneca 3 and on Seneca 4. The two
versions of the core treat transports differently, and the Seneca 4
prerelease (4.0.0-rc5) has quirks of its own: injected HTTP defaults,
close hooks on the Seneca 3 pattern that are never called, and a
`ready()` promise that can hang. This page collects the differences and
the reasons behind the compatibility code.

## Who loads the plugin, and under which name

Seneca 3 bundles the transport: it depends on the `seneca-transport`
package and, with the default option `legacy.transport: true`, calls
`require('seneca-transport')` itself at startup
(`default_plugins.transport`), so `listen` and `client` work without any
`use`. Seneca 4 removed network transports from the core; `listen` and
`client` dispatch to `role:transport,hook:listen|client,type:<type>`
and nothing answers unless a transport plugin is loaded.

The package was renamed with version 8.4.0: versions up to 8.3.0 were
published as `seneca-transport`, from 8.4.0 the package is
`@seneca/transport`. Seneca 3's dependency still names the old package,
so on Seneca 3 the bundled copy is 8.3.0. Loading `@seneca/transport`
as well gives two plugins named `transport`: the one loaded last
provides the active hooks and the `transport/utils` export, and the
bundled one remains as their prior. With
`default_plugins: { transport: false }` Seneca 3 skips the bundled copy,
which is the cleaner setup; Seneca 4 accepts and ignores that option.

## Type aliases: `web`, `http`, `direct`

Seneca 3's core rewrote the types `http` and `direct` to `web` while
resolving the configuration, before calling the hook. Seneca 4 passes
the type through unchanged. Up to version 8.3 the plugin registered
hooks for `http` and `direct` (as the old API required) but read its
options with `options[type]`, which does not exist for those names, so
`client({ type: 'http' })` on Seneca 4 failed with `Cannot read
properties of undefined (reading 'headers')`. Version 8.4 resolves the
three names to the `web` options; the hooks for all three remain.

## The shared `transport` options

Seneca core keeps a shared configuration block, `options.transport`,
whose scalar values fill in missing keys of every `listen` and
`client` configuration. What it contains differs:

| Core | `options.transport` after startup | Effect |
| ---- | --------------------------------- | ------ |
| Seneca 3.38 | `{ port: 10101 }` plus whatever you set | The plugin's defaults apply: listeners bind `0.0.0.0`, HTTP path `/act`, protocol `http`. |
| Seneca 4.0.0-rc5 | `{ port: 10101, host: '127.0.0.1', path: '/act', protocol: 'http' }` | Listeners bind `127.0.0.1` by default; `path: '/act'` and `protocol: 'http'` are copied into every configuration, including TCP ones. |
| Seneca 4.0.0 (master) | `{ port: 10101 }` plus whatever you set | As Seneca 3. |

Two rules of the core's resolution matter here. First, the top level
values are copied before the type sections are applied, so they win
over `transport.web` and `transport.tcp` and over the plugin's own
`web` and `tcp` options. Second, they are copied into every
configuration, whatever the type. Because `transport.port` always has a
value, the plugin's `web.port` and `tcp.port` options never take
effect, on any version (see
[precedence.js](../examples/precedence.js)). On 4.0.0-rc5 the same
applies to `host`, `path` and `protocol`: the plugin options
`web.host`, `web.path` and `web.protocol` are overridden there, so a
listener configured with `web: { protocol: 'https' }` serves plain HTTP
on rc5 and HTTPS on 4.0.0. Seneca 4.0.0 no longer injects these HTTP
defaults (core change senecajs/seneca#953).

For a TCP listener a `path` means a UNIX domain socket, so on 4.0.0-rc5
the copied `/act` made the listener try to bind a socket file named
`/act` and never listen on its port. Version 8.4 ignores the path when
both it and the shared `transport.path` are `/act`, and uses the
plugin's `tcp.path` option instead if it is set (the injected value
would otherwise hide that option too, since configuration values take
precedence over plugin options). Any other path is used as given. That
includes a top level `transport.path` set by the application: it
reaches TCP listeners as well, on Seneca 3 as on 4, and turns them into
socket listeners. Keep HTTP paths per call or in a `web` section.

The host difference is visible in the `listen` callback result:
`host: '127.0.0.1'` on rc5, `host: '0.0.0.0'` on Seneca 3 and on 4.0.0.
Set `host` explicitly when it matters.

## Close hooks

Seneca 3 closes an instance through the action `role:seneca,cmd:close`;
Seneca 4 through `sys:seneca,cmd:close`. The 4.0.0 release calls hooks
registered on the Seneca 3 pattern for compatibility, but 4.0.0-rc5
never does, so with version 8.3 listeners were not closed on rc5 and
processes did not exit. Version 8.4 registers its close hooks on the
pattern that matches the running version
(`transportUtil.closePattern(seneca)`: `role:seneca,cmd:close` for
versions `0.x` to `3.x`, `sys:seneca,cmd:close` otherwise). Note that
`seneca.has('sys:seneca,cmd:close')` is true on Seneca 3 as well (it
translates `sys:seneca` to `role:seneca`), so the version string is the
discriminator.

## Error replies

Seneca 4 attaches `meta$` to errors replied by actions; version 8.4
serializes errors without it (see
[Errors on the wire](errors-on-the-wire.md)). On the client, Seneca 4
delivers the rebuilt error unwrapped (`err.message` is the remote
message), while Seneca 3 wraps errors that are not Seneca errors in an
`act_execute` error.

## Plugin options

On both versions the plugin's options come from `seneca.use(plugin,
options)` and from `options.plugin.transport`. The shared
`options.transport` block is read by the core when it resolves a
`listen` or `client` configuration (its `web` and `tcp` sections fill in
type specific keys), not merged into the plugin's options; the plugin
only reads `transport.path` for the TCP comparison above.

## Promises and `ready`

Seneca 4 has `post`, `message`, promise returning `ready()` and
`close()` built in; the examples in this documentation use them. On
Seneca 3 they need [seneca-promisify](https://github.com/senecajs/seneca-promisify)
or the callback forms. In 4.0.0-rc5 `await seneca.ready()` on an idle
instance never resolves (fixed in 4.0.0); the examples use
`seneca.ready(function () { ... })` instead.

## Behaviour that is the same on both

* The wire formats, headers and envelopes.
* `seneca.status().transport.register` and `seneca.ping().tr` stay
  empty with the plugin loaded (see
  [What is not recorded](message-lifecycle.md#8-what-is-not-recorded)).
* The `track.push is not a function` failure when relaying an inbound
  message object (see
  [Loop detection and its limits](message-lifecycle.md#6-loop-detection-and-its-limits)).
* The `transport/utils` export. On Seneca 4 the core has its own object
  under the same key (with `externalize_msg`, `internalize_reply` and
  so on); loading this plugin replaces it with the plugin's utilities.

## Node.js

Seneca 4 requires Node.js 22 or later. This plugin declares
`engines.node >= 18`. Its test suite, which asserts Seneca 4 behaviour,
runs on Node.js 24 and 22 with Seneca 4.0.0-rc5 and with the unreleased
4.0.0; the example programs were also run on Seneca 3.38.
