![Seneca](http://senecajs.org/files/assets/seneca-logo.png)
> A [Seneca.js][] plugin

# @seneca/transport

[![npm version][npm-badge]][npm-url]
[![build][build-badge]][build-url]

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

The standard network transport for [Seneca](https://github.com/senecajs/seneca)
microservices. It provides the `web` (HTTP and HTTPS) and `tcp`
transport types behind `seneca.listen()` and `seneca.client()`, so that
actions defined in one process can be called from another without
changing the code that sends the messages. Version 8.4 runs on Seneca 3
and on Seneca 4 (tested with 4.0.0-rc5 and the unreleased 4.0.0), with
Node.js 22 and 24.

Full documentation: [docs/](docs/README.md) (tutorial, how-to guides,
reference and explanation).

## Install

```sh
npm install seneca @seneca/transport
```

Versions up to 8.3.0 were published as `seneca-transport`; from 8.4.0
the package is `@seneca/transport`, which is not on npm yet. Until it
is, `npm install seneca-transport` installs 8.3.0, which does not have
the Seneca 4 fixes listed in the [change log](CHANGES.md).

Seneca 4 does not include a network transport. Load the plugin in every
process that calls `listen` or `client`:

```js
const Seneca = require('seneca')
const seneca = Seneca().use('@seneca/transport')
```

Seneca 3 depends on `seneca-transport` 8.3.0 and loads it by itself. To
use this version there, pass `default_plugins: { transport: false }` and
load `@seneca/transport` as above; see
[Run on Seneca 3 and Seneca 4](docs/how-to/run-on-seneca-3-and-4.md).

## Quick Example

A service and a client in one process, over HTTP
([docs/examples/one-process.js](docs/examples/one-process.js)). The
`color` plugin ([docs/examples/color.js](docs/examples/color.js)) turns
color names into hex values.

```js
const Seneca = require('seneca')
const color = require('./color')

// The service: loads the plugin and listens for role:color messages.
const service = Seneca({ tag: 'service', log: 'warn' })
  .use('@seneca/transport')
  .use(color)
  .listen({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

service.ready(function () {
  // The client: sends role:color messages to the service.
  const client = Seneca({ tag: 'client', log: 'warn' })
    .use('@seneca/transport')
    .client({ type: 'web', port: 8274, pin: 'role:color,cmd:*' })

  client.ready(async function () {
    try {
      console.log(await client.post('role:color,cmd:list'))
      console.log(await client.post('role:color,cmd:hex,name:red'))
    } catch (err) {
      console.error('ERROR', err.message)
      process.exitCode = 1
    } finally {
      // Closing releases the listening socket, so the process exits.
      await client.close()
      await service.close()
    }
  })
})
```

```
$ node one-process.js
{ names: [ 'red', 'green', 'blue' ] }
{ name: 'red', hex: '#FF0000' }
```

Replace `type: 'web'` with `type: 'tcp'` on both sides to use TCP. A
`web` listener also answers plain HTTP clients; with
[docs/examples/http-service.js](docs/examples/http-service.js) running:

```
$ curl -s -X POST http://127.0.0.1:8270/act -H 'Content-Type: application/json' \
    -d '{"role":"color","cmd":"hex","name":"plum"}'
{"name":"plum","hex":"#8E4585"}
```

## More Examples

| Example | Shows |
| ------- | ----- |
| [Getting started](docs/tutorials/getting-started.md) | A service and a client as separate processes, over HTTP and then over TCP. |
| [Choose and configure a transport type](docs/how-to/choose-and-configure-a-transport-type.md) | `web`, `http`, `direct` and `tcp`; where configuration values come from. |
| [Use HTTPS](docs/how-to/use-https.md) | A self-signed certificate, `protocol: 'https'`, `serverOptions`, trusting the certificate on the client. |
| [Call a listener without Seneca](docs/how-to/call-a-listener-without-seneca.md) | `curl`, query parameters, a raw TCP client. |
| [Pass errors between services](docs/how-to/pass-errors-between-services.md) | What an error looks like after the hop: message, code, details, status. |
| [Tune timeouts, retries and message checks](docs/how-to/tune-timeouts-retries-and-message-checks.md) | The three timeouts, listen retries, `callmax`, loop checks. |
| [Run on Seneca 3 and Seneca 4](docs/how-to/run-on-seneca-3-and-4.md) | A callback style client that runs unchanged on both. |
| [Write a transport plugin](docs/how-to/write-a-transport-plugin.md) | An in-memory transport built on the `transport/utils` export. |

The programs are in [docs/examples](docs/examples/); each was run
against the Seneca 4 prerelease and its output is in the documentation.
Inside this repository they load the plugin by relative path; in your
own code write `require('@seneca/transport')` or
`seneca.use('@seneca/transport')`.

## Motivation

Seneca separates what a message means from where it is handled. This
plugin supplies the where: it carries messages and replies over HTTP or
TCP with the identifiers, tracking and error information that let a
remote action behave like a local one. See
[How a message travels](docs/explanation/message-lifecycle.md).

## Support

If you're using this module and need help, you can:

- Post a [github issue][]
- Read the [Seneca documentation](https://github.com/senecajs/seneca/blob/master/docs/README.md),
  in particular [Use network transports](https://github.com/senecajs/seneca/blob/master/docs/how-to/use-network-transports.md)
- Contact [Voxgig](https://www.voxgig.com), the sponsor of the Seneca project

## API

Configuration keys for `listen` and `client` (see [Options](docs/reference/options.md)):

| Key | Default | Meaning |
| --- | ------- | ------- |
| `type` | `web` | `web` (aliases `http`, `direct`) or `tcp`. |
| `port` | `10101` | Port to listen on or connect to. The default comes from Seneca's shared `transport.port` option, for both types. |
| `host` | `0.0.0.0` | Address to bind, or host to connect to (`0.0.0.0` connects to `127.0.0.1`). Seneca 4.0.0-rc5 supplies `127.0.0.1`. |
| `path` | `/act` | HTTP path. For a `tcp` listener, a UNIX domain socket path to listen on instead of a port. |
| `protocol` | `http` | `http` or `https` (web only). |
| `pin`, `pins` | none | Patterns the client sends to the remote side. |
| `timeout` | `5555` | HTTP client request timeout in milliseconds (web only). |
| `serverOptions` | `{}` | Options for `https.createServer`. |

Plugin options (`seneca.use('@seneca/transport', { ... })`):
`msgprefix`, `callmax`, `msgidlen`, `warn.*`, `check.*`, `web.*`
(including `web.headers`), `tcp.*` (including `tcp.path`). See
[Options](docs/reference/options.md).

| Action pattern | Purpose | Reference |
| -------------- | ------- | --------- |
| `role:transport,cmd:listen` | Called by `seneca.listen()`; dispatches to the listen hook. | [Messages](docs/reference/messages.md) |
| `role:transport,cmd:client` | Called by `seneca.client()`; dispatches to the client hook. | [Messages](docs/reference/messages.md) |
| `role:transport,cmd:inflight` | Lists the requests this instance is waiting for. | [Messages](docs/reference/messages.md) |
| `role:transport,hook:listen,type:web|http|direct|tcp` | Starts a listener. | [Messages](docs/reference/messages.md) |
| `role:transport,hook:client,type:web|http|direct|tcp` | Creates a client. | [Messages](docs/reference/messages.md) |

| Export | Purpose | Reference |
| ------ | ------- | --------- |
| `seneca.export('transport/utils')` | Helpers for writing transport plugins. | [Utilities](docs/reference/utils.md) |

Wire formats: [HTTP protocol](docs/reference/http-protocol.md),
[TCP protocol](docs/reference/tcp-protocol.md). Error codes:
[Errors](docs/reference/errors.md).

## Contributing

The [Senecajs org][] encourages open participation. If you feel you can
help in any way, be it with documentation, examples, extra testing, or
new features please get in touch.

### Running tests

The tests use [@hapi/lab](https://github.com/hapijs/lab) and run on
Node.js 24 (default) and 22:

```sh
npm install
npm test
```

The `seneca` development dependency is the Seneca 4 prerelease
(`^4.0.0-rc5`), and the tests assert Seneca 4 behaviour (for example
unwrapped remote errors). To run them against another Seneca 4 build,
install it without saving, run the tests, and restore:

```sh
npm install --no-save seneca@<version or tarball>
npm test
npm install
```

The programs in [docs/examples](docs/examples/) load the plugin by
relative path (`require('../..')`), so they run from a checkout; run
each one after changing behaviour that the documentation describes.

Format the code with `npm run prettier` before committing. The
`.patches/` folder holds a change to the GitHub Actions workflow that
could not be committed directly; see [.patches/README.md](.patches/README.md).

Maintainers: see [Create a release](docs/how-to/create-a-release.md).

## Background

This plugin dates from 2013 and was the transport bundled with Seneca up
to and including Seneca 3, which loads it automatically (`legacy.transport`).
Seneca 4 removed network transports from the core, so the plugin is now
loaded explicitly. Version 8.4 adds Seneca 4 support; the
[change log](CHANGES.md) lists what changed and
[Seneca 3 versus 4](docs/explanation/seneca-3-versus-4.md) explains the
differences.

Versions up to 8.3.0 were published as `seneca-transport`; from 8.4.0
the package is `@seneca/transport`, which is not on npm yet.

| Seneca | Node.js 22 | Node.js 24 |
| ------ | ---------- | ---------- |
| 3.38 | supported | supported |
| 4.0.0-rc5 | supported | supported |
| 4.0.0 (unreleased) | supported | supported |

Verified for 8.4: the test suite on Seneca 4.0.0-rc5 (Node.js 22 and
24) and 4.0.0; every program in [docs/examples](docs/examples/) on
4.0.0-rc5 (Node.js 22 and 24) and 4.0.0 (Node.js 24); the callback
style ones (the services and `portable-client.js`) also on 3.38.

Other transports are separate plugins, for example
[seneca-redis-transport](https://github.com/senecajs/seneca-redis-transport),
[seneca-beanstalk-transport](https://github.com/senecajs/seneca-beanstalk-transport)
and [seneca-amqp-transport](https://github.com/senecajs/seneca-amqp-transport).

License: [MIT][].

[npm-badge]: https://img.shields.io/npm/v/@seneca/transport.svg
[npm-url]: https://www.npmjs.com/package/@seneca/transport
[build-badge]: https://github.com/senecajs/seneca-transport/actions/workflows/build.yml/badge.svg
[build-url]: https://github.com/senecajs/seneca-transport/actions/workflows/build.yml
[MIT]: ./LICENSE
[Senecajs org]: https://github.com/senecajs/
[Seneca.js]: https://www.npmjs.com/package/seneca
[github issue]: https://github.com/senecajs/seneca-transport/issues
