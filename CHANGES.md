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
  timeout (TCP). Non-2xx HTTP responses are read for their error body.
* The TCP listener ignores a `path` equal to the shared `transport.path`
  option (Seneca 4.0.0-rc core copied its HTTP path `/act` into TCP
  configurations, which was then treated as a UNIX socket path).
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
