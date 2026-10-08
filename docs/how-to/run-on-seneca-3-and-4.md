# Run on Seneca 3 and Seneca 4

Goal: write services and clients that work with both Seneca major
versions, or know which difference you are hitting. Version 8.4 of the
plugin supports both; the differences are explained in
[Seneca 3 versus 4](../explanation/seneca-3-versus-4.md). The program
on this page is [portable-client.js](../examples/portable-client.js).

## 1. Load the plugin explicitly, and only once

```js
const Seneca = require('seneca')

const seneca = Seneca({
  // Seneca 3 also loads the seneca-transport package it depends on;
  // this option leaves only the plugin loaded below. Seneca 4 ignores it.
  default_plugins: { transport: false },
}).use('@seneca/transport')
```

Seneca 4 needs the `use`: it has no transport of its own. Seneca 3
depends on the `seneca-transport` package (8.3.0, the last version
published under that name) and loads it at startup unless
`default_plugins.transport` is false. Without the option you get two
copies of the plugin, both named `transport`: the one you load last
provides the active hooks and the `transport/utils` export, and the
bundled one stays behind as their prior. That works, but it is one copy
too many.

Dependencies: `@seneca/transport@^8.4.0`, with `seneca` as a peer
(`>=3 || >=4.0.0-rc5`).

## 2. Use the API both versions have

Callbacks work everywhere: `add`, `act(msg, callback)`, `listen`,
`client`, `ready(callback)`, `close(callback)`. The promise API (`post`,
`message`, `await ready()`, `await close()`) is built into Seneca 4;
on Seneca 3 load [seneca-promisify](https://github.com/senecajs/seneca-promisify)
for it. A client in callback style, which closes its instance on every
path:

```js
seneca.ready(function () {
  seneca.act('role:color,cmd:hex,name:plum', function (err, out) {
    if (err) return finish(err)
    console.log('Seneca ' + seneca.version + ' over ' + type + ':', out)

    // An expected failure: the service replies with an unknown_color error.
    seneca.act('role:color,cmd:hex,name:pink', function (err) {
      console.log('expected error:', err && err.code, '|', err && err.message)
      finish()
    })
  })
})

// Close the instance on every path, so that the process exits.
function finish(err) {
  if (err) {
    console.error('ERROR', err.message)
    process.exitCode = 1
  }
  seneca.close()
}
```

Run against the tutorial's services ([http-service.js](../examples/http-service.js),
[tcp-service.js](../examples/tcp-service.js)), which also use only this
API, with each Seneca version installed in turn:

```
$ node portable-client.js web
Seneca 3.38.0 over web: { name: 'plum', hex: '#8E4585' }
expected error: unknown_color | seneca: Unknown color: pink.
$ node portable-client.js tcp
Seneca 3.38.0 over tcp: { name: 'plum', hex: '#8E4585' }
expected error: unknown_color | seneca: Unknown color: pink.

$ node portable-client.js web
Seneca 4.0.0-rc5 over web: { name: 'plum', hex: '#8E4585' }
expected error: unknown_color | seneca: Unknown color: pink.

$ node portable-client.js tcp
Seneca 4.0.0 over tcp: { name: 'plum', hex: '#8E4585' }
expected error: unknown_color | seneca: Unknown color: pink.
```

On Seneca 4.0.0-rc5, `await seneca.ready()` on an idle instance never
resolves; use `seneca.ready(callback)` or
`await new Promise((resolve) => seneca.ready(resolve))`.

## 3. Expect different error shapes

| | Seneca 3 | Seneca 4 |
| --- | -------- | -------- |
| Error made with `seneca.error`/`seneca.fail` | `err.code` and `err.message` as created | the same |
| Plain `Error` from the remote action | `err.message` is `seneca: Action <pattern> failed: <message>.`, `err.code` is `act_execute`, `err.details.message` is the remote message | `err.message` is the remote message, `err.code` is undefined |
| HTTP error from a proxy or a wrong path | `seneca: Action <pattern> failed: Response Error: 404 Not Found.` | `Response Error: 404 Not Found` |

The service above replies with `this.error('unknown_color', ...)`, so
the error looks the same on both. For plain errors, a portable way to
get the remote text is:

```js
const text = (err.details && err.details.message) || err.message
```

## 4. Set the host on Seneca 4.0.0-rc5

Listeners bind `0.0.0.0` by default on Seneca 3 and on 4.0.0, but
`127.0.0.1` on 4.0.0-rc5 (that core copies its own defaults into every
configuration). Pass `host` explicitly when it matters.

## 5. Do not count on registrations

`seneca.status().transport.register` and `seneca.ping().tr` are empty
with this plugin on both versions.

## 6. Verify both

Install the other version without saving and run your own tests:

```sh
npm install --no-save seneca@3
npm test
npm install          # back to the version in package.json
```

For Seneca 4 use `seneca@^4.0.0-rc5` (or `seneca@4` once released).
Both run on Node.js 22 and 24; Seneca 4 requires Node.js 22 or later.
