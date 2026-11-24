# Choose the transport package for Seneca 3 or Seneca 4

Goal: give each application the transport package that matches its
Seneca major version, and check which one is loaded. The differences
between the two cores are explained in
[Seneca 3 versus 4](../explanation/seneca-3-versus-4.md).

## 1. Match the package to the Seneca version

| Application | Transport package | How it is loaded |
| ----------- | ----------------- | ---------------- |
| Seneca 3 (`seneca@3`, 3.38.0) | `seneca-transport` 8.3.0 | Seneca 3 depends on it and loads it by itself. |
| Seneca 4 (`seneca@^4`) | `@seneca/transport` 9 | You load it with `seneca.use('@seneca/transport')`. |

Version 9 declares the peer dependency `seneca` `^4.0.0` and nothing
else, so it does not run on Seneca 3. That range does not admit the
4.0.0-rc prereleases either. Version 8.3.0 is the last version
published as `seneca-transport`; that package is not deprecated and
stays the transport of Seneca 3. Version 8.4.0 was never published;
its changes are part of 9.0.0.

One code base cannot use version 9 on Seneca 3. Code that must run on
both majors needs a separate set of dependencies for each. The
`listen` and `client` calls and the callback API can be shared; only
the Seneca 4 setup loads `@seneca/transport`.

## 2. Seneca 3: keep the bundled package

There is nothing to install. `seneca@3.38.0` brings `seneca-transport`
8.3.0, and `listen` and `client` work without a `use`. If you list the
package in your own `package.json`, pin it to the 8.3 line:

```sh
npm install seneca@3 seneca-transport@^8.3.0
```

Do not add `@seneca/transport` to a Seneca 3 application.

## 3. Seneca 4: install and load `@seneca/transport`

```sh
npm install seneca@^4 @seneca/transport@^9
```

Write `seneca@^4`: until Seneca 4.0.0 is the npm `latest` release, a
bare `seneca` installs 3.38.0. Seneca 4.0.0 and this plugin both need
Node.js 24 or later.

Seneca 4 has no transport of its own. Load the plugin in every process
that calls `listen` or `client`:

```js
const Seneca = require('seneca')

const seneca = Seneca().use('@seneca/transport')
// or: Seneca().use(require('@seneca/transport'))
```

Without it, `listen` fails fatally (`transport_listen`: no action for
`role:transport,hook:listen,type:web`). The steps for an existing
application are in [Migrate from Seneca 3](migrate-from-seneca-3.md).

## 4. Do not install both into one Seneca 4 application

Both packages register a plugin named `transport`. Loading both gives
two plugins under one name: the one loaded last provides the active
hooks and the `transport/utils` export. Seneca 4 does not load
`seneca-transport` by itself, but a leftover dependency is easy to load
by mistake, and version 8.3.0 cannot pass a remote error back on
Seneca 4 (see [Errors on the wire](../explanation/errors-on-the-wire.md)).
Remove `seneca-transport` from the dependencies of a Seneca 4
application and load only `@seneca/transport`.

## 5. Check which one is loaded

* `seneca.version` names the core: `3.38.0` or `4.0.0`, for example.
  On Seneca 3 the transport is the bundled `seneca-transport`, unless
  the application set `default_plugins: { transport: false }`.
* `npm ls seneca-transport @seneca/transport` shows which of the two
  packages are installed, in which version, and which package depends
  on each. In a Seneca 4 application only `@seneca/transport@9` should
  appear.
* `seneca.list('role:transport,hook:listen')` lists the listen hooks.
  It is empty on Seneca 4 when no transport plugin is loaded. Both
  packages add the same patterns, so it does not tell them apart.

## 6. Name the transport type `web`

Write `type: 'web'` (or `tcp`) in `listen` and `client` calls. Seneca 3
treated `http` and `direct` as names of `web`. Seneca 4.0.0 still
accepts them, maps them to `web` and prints the deprecation warning
`SENECA_DEP_TRANSPORT_TYPE`. This plugin also registers hooks for
`http` and `direct`, but new code should not rely on these names. See
[Choose and configure a transport type](choose-and-configure-a-transport-type.md).
