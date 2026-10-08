## 8.4.0 2026-10-07

* Seneca 4 support (tested against seneca 4.0.0-rc5 and the unreleased
  4.0.0), alongside Seneca 3.
* The `http` and `direct` transport types resolve to the `web` options.
  Seneca 3 mapped these types to `web` in core; Seneca 4 passes them
  through, which made `client({type:'http'})` fail with
  "Cannot read properties of undefined (reading 'headers')".
* Close hooks are registered on `sys:seneca,cmd:close` when running on
  Seneca 4 (`role:seneca,cmd:close` on Seneca 3), so listeners and client
  connections are released by `seneca.close()` on both versions.
* Errors replied by remote actions are serialized without the Seneca 4
  `meta$` property, which could not be serialized. Remote errors now
  reach the client with their message, name, code and details over both
  HTTP and TCP, instead of a generic "Response Error: 500" (HTTP) or a
  timeout (TCP). A non-2xx HTTP response from a Seneca listener (marked
  by the `seneca-kind: res` header) is read for its error body; any other
  non-2xx response, such as one from a proxy, fails the call straight
  away with the HTTP error.
* The TCP listener ignores the path `/act` when the shared
  `transport.path` option is also `/act`. Seneca 4.0.0-rc core sets that
  HTTP default and copies it into every listen configuration, over the
  plugin's `tcp.path` option, and the listener took it for a UNIX socket
  path. The plugin's `tcp.path` is used instead, if set; any other path,
  including a shared `transport.path` set by the application, is used as
  given, as on Seneca 3.
* Node.js 24 is the default target (Node.js 22 also tested); `engines.node`
  is `>=18`. Removed Travis CI configuration and the coveralls script.
* Documentation reorganized following the Diátaxis structure (see `docs/`).

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
