# Seneca 3 versus 4

Version 9.0 of this plugin runs on Seneca 4 only. Seneca 3 applications
keep the `seneca-transport` 8.3.0 package that Seneca 3 loads by
itself. The two versions of the core treat transports differently. This
page collects the differences and the reasons behind the compatibility
code.

## Who loads the plugin, and under which name

Seneca 3 bundles the transport: it depends on the `seneca-transport`
package and, with the default option `legacy.transport: true`, calls
`require('seneca-transport')` itself at startup
(`default_plugins.transport`), so `listen` and `client` work without any
`use`. Seneca 4 removed network transports from the core; `listen` and
`client` dispatch to `role:transport,hook:listen|client,type:<type>`
and nothing answers unless a transport plugin is loaded.

Versions up to 8.3.0 were published as `seneca-transport`. Version
9.0.0 is the first version published as `@seneca/transport`; 8.4.0 was
never published, and its changes are part of 9.0.0. Seneca 3's
dependency still names the old package, so Seneca 3 applications run
8.3.0. Version 9 declares the peer dependency `seneca` `^4.0.0` and
does not support Seneca 3. Both packages register a plugin named
`transport`, so a Seneca 4 application loads only `@seneca/transport`
(see
[Choose the transport package for Seneca 3 or Seneca 4](../how-to/run-on-seneca-3-and-4.md)).
`default_plugins: { transport: false }` only matters on Seneca 3;
Seneca 4 accepts and ignores it.

## Type aliases: `web`, `http`, `direct`

Seneca 3's core rewrote the types `http` and `direct` to `web` while
resolving the configuration, before calling the hook. Seneca 4.0.0 does
the same, and prints the deprecation warning
`SENECA_DEP_TRANSPORT_TYPE`. Up to version 8.3 the plugin registered
hooks for `http` and `direct` (as the old API required) but read its
options with `options[type]`, which does not exist for those names, so
a hook called with one of them failed with `Cannot read properties of
undefined (reading 'headers')`. Version 9.0 resolves the three names to
the `web` options; the hooks for all three remain. Write `type: 'web'`.

## The shared `transport` options

Seneca core keeps a shared configuration block, `options.transport`,
whose scalar values fill in missing keys of every `listen` and
`client` configuration. After startup it contains `{ port: 10101 }`
plus whatever the application set, on Seneca 3.38 as on 4.0.0. The
plugin's defaults then apply for the other keys: listeners bind
`0.0.0.0`, the HTTP path is `/act` and the protocol `http`.

Two rules of the core's resolution matter here. First, the top level
values are copied before the type sections are applied, so they win
over `transport.web` and `transport.tcp` and over the plugin's own
`web` and `tcp` options. Second, they are copied into every
configuration, whatever the type. Because `transport.port` always has a
value, the plugin's `web.port` and `tcp.port` options never take
effect (see [precedence.js](../examples/precedence.js)).

For a TCP listener a `path` means a UNIX domain socket. A top level
`transport.path` set by the application reaches TCP listeners as well,
on Seneca 3 as on 4, and turns them into socket listeners. Keep HTTP
paths per call or in a `web` section.

## Close hooks

Seneca 3 closes an instance through the action `role:seneca,cmd:close`;
Seneca 4 through `sys:seneca,cmd:close`. Seneca 4.0.0 still calls hooks
registered on the Seneca 3 pattern, but prints the deprecation warning
`SENECA_DEP_LEGACY_CLOSE_HOOK`; version 8.3 of this plugin registered
its hooks there. Version 9.0 registers its close hooks on the pattern
that matches the running version
(`transportUtil.closePattern(seneca)`: `role:seneca,cmd:close` for
versions `0.x` to `3.x`, `sys:seneca,cmd:close` otherwise), which on
Seneca 4 is `sys:seneca,cmd:close`. Note that
`seneca.has('sys:seneca,cmd:close')` is true on Seneca 3 as well (it
translates `sys:seneca` to `role:seneca`), so the version string is the
discriminator.

## Error replies

Seneca 4 attaches `meta$` to errors replied by actions. Version 8.3.0
tries to serialize it and fails, so it cannot pass a remote error back
on Seneca 4; version 9.0 serializes errors without it (see
[Errors on the wire](errors-on-the-wire.md)). On the client, Seneca 4
delivers the rebuilt error unwrapped (`err.message` is the remote
message), while Seneca 3 wraps errors that are not Seneca errors in an
`act_execute` error.

## Plugin options

The plugin's options come from `seneca.use(plugin, options)` and from
`options.plugin.transport`. The shared `options.transport` block is
read by the core when it resolves a `listen` or `client` configuration
(its `web` and `tcp` sections fill in type specific keys), not merged
into the plugin's options; the plugin only reads `transport.path` for
the TCP path check described in the last section.

## Promises and `ready`

Seneca 4 has `post`, `message`, promise returning `ready()` and
`close()` built in; the examples in this documentation use them. On
Seneca 3 they need [seneca-promisify](https://github.com/senecajs/seneca-promisify)
or the callback forms.

## Behaviour that is the same on both

These hold for `seneca-transport` 8.3.0 on Seneca 3 and for version 9.0
on Seneca 4:

* The wire formats, headers and envelopes.
* `seneca.status().transport.register` and `seneca.ping().tr` stay
  empty with the plugin loaded (see
  [What is not recorded](message-lifecycle.md#8-what-is-not-recorded)).
* The `track.push is not a function` failure when relaying an inbound
  message object (see
  [Loop detection and its limits](message-lifecycle.md#6-loop-detection-and-its-limits)).
* The plugin's `transport/utils` export. On Seneca 4 the core has its
  own object under the same key (with `externalize_msg`,
  `internalize_reply` and so on). Loading this plugin replaces it with
  the plugin's utilities, which also carry the core helpers
  (`externalize_msg`, `externalize_reply`, `internalize_msg`,
  `internalize_reply`, `info`), so transports written against the core
  export keep working.

## Node.js

Seneca 4.0.0 requires Node.js 24 or later, and so does this plugin
(`engines.node` `>=24`). The 9.0.0 test suite, which asserts Seneca 4
behaviour, was run against the Seneca 4.0.0 release candidate code
(not a published version) on Node.js 26, on Linux.

## The 4.0.0 prereleases

The Seneca 4.0.0-rc prereleases, such as 4.0.0-rc5, behaved
differently: they passed the types `http` and `direct` through
unchanged, copied the HTTP defaults `host: '127.0.0.1'`, `path: '/act'`
and `protocol: 'http'` into every configuration (so a TCP listener took
`/act` for a socket path), never called close hooks on
`role:seneca,cmd:close`, and left `await seneca.ready()` pending on an
idle instance. Version 9 does not support them; the range `^4.0.0` does
not admit prereleases. The plugin still ignores a TCP `path` of `/act`
when the shared `transport.path` is also `/act`, a workaround kept for
compatibility.
