# Changes

## 9.0.0 2026-11-20

First version published as `@seneca/transport`. Versions up to 8.3.0
were published as `seneca-transport`. Version 8.4.0 was never published;
its changes are part of this release.

* Seneca 4: the peer dependency is `seneca` `^4.0.0`, and Seneca 3 is no
  longer supported. Seneca 3 users stay on `seneca-transport@8`:
  `seneca@3.38.0` depends on `seneca-transport` `^8.3.0` and loads it by
  itself.
* Renamed from `seneca-transport` to `@seneca/transport`.
* Node.js 24 or later (`engines.node` `>=24`).
* Remote errors reach the caller unwrapped, with their own `message`,
  `name`, `code` and `details`, over both HTTP and TCP (B12). The error
  is sent without the Seneca 4 `meta$` property, which could not be
  serialized: on Seneca 4, `seneca-transport` 8.3.0 replies to a failed
  remote action over HTTP with "Response Error: 500 Internal Server
  Error" and no `code`. A non-2xx HTTP response from a Seneca listener
  (marked by the `seneca-kind: res` header) is read for its error body;
  any other non-2xx response, such as one from a proxy, fails the call
  straight away with the HTTP error.
* The exported `transport/utils` object keeps the helpers of the Seneca 4
  core export (`externalize_msg`, `externalize_reply`, `internalize_msg`,
  `internalize_reply`, `info`), and `stringifyJSON` and `parseJSON` also
  accept the single argument core form. Transport plugins written against
  the core export no longer break when this plugin is loaded.
* The transaction id of an inbound message is set on the delegate's
  `fixedmsg`, read as `fixedmsg ?? fixedargs`, so Seneca 4.0.0 does not
  warn about `fixedargs` (D6).
* Seneca 4 deprecation warnings from the plugin's own code are removed:
  `seneca.util.deep` replaces `seneca.util.deepextend` (D2), and
  `seneca.list` replaces `seneca.findpins` in `listen_topics` (D1). Use
  the transport type `web`: Seneca 4.0.0 maps `http` and `direct` to
  `web` with a deprecation warning (D5). The plugin still registers
  hooks for both names.
* Entities: the required peer dependency `seneca-entity` `>=28` is
  replaced by an optional peer dependency `@seneca/entity` `^29.0.0`.
  The plugin only uses `seneca.make$` when it is there. The old peer made
  npm install `seneca-entity` 28, which Seneca 4 rejects with
  `plugin_gubu_shape`.
* Close hooks are registered on `sys:seneca,cmd:close`, so listeners and
  client connections are released by `seneca.close()`.
* The TCP listener ignores the path `/act` when the shared
  `transport.path` option is also `/act` (a default of the Seneca 4
  release candidates, where it made the listener open a UNIX socket
  instead of its port). The plugin's `tcp.path` is used instead, if set.
* A pinned client built by `make_client` without an `id` no longer fails
  with `ReferenceError: self is not defined`.
* `CHANGES.md` is included in the package.
* Development: tests load `@seneca/entity`; removed the unused
  development dependencies `@hapi/joi` and `bench` and the
  `seneca-transport-test` 1.x dependency with the two scripts that used
  it and never ran; removed the benchmark scripts, which do not run on
  Seneca 4; the manual demo scripts in `test/stubs` load the transport.
  Removed Travis CI configuration and the coveralls script.
* Documentation reorganized following the Diátaxis structure (see
  `docs/`), and updated for this release.
* Tested: the test suite against the Seneca 4.0.0 release code on Node.js
  26 on Linux.

## 2.1.0 2016-08-25

* Removed seneca-chain dependency PR#115
* Updated dependencies
* Added Seneca 3 and Node 6 support
* Dropped Node 0.10, 0.12, 5 support

## 2.0.0 2016-08-12

* Fix tcp transport breaks seneca mesh
* Dropped support for Node 0.10, 0.12
* Dependencies update

## 1.3.0

* Documentation update
* Dependencies update
* Tests fixes
