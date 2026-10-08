# Use HTTPS

Goal: run a `web` listener over TLS and call it from a Seneca client
and from `curl`. The programs are
[https-service.js](../examples/https-service.js) and
[https-client.js](../examples/https-client.js).

## 1. Get a certificate

For development, a self-signed certificate for `localhost`:

```sh
mkdir certs && cd certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

In production use a certificate from your certificate authority.

## 2. The service

Pass `protocol: 'https'` and the server options (anything
`https.createServer` accepts) in the `listen` configuration:

```js
const Fs = require('fs')
const Path = require('path')
const Seneca = require('seneca')
const color = require('./color')

// Read the key and certificate first: a missing file stops the program
// here, before any Seneca instance exists.
const dir = process.argv[2] || Path.join(__dirname, 'certs')
const serverOptions = {
  key: Fs.readFileSync(Path.join(dir, 'key.pem')),
  cert: Fs.readFileSync(Path.join(dir, 'cert.pem')),
}

const seneca = Seneca({
  tag: 'color',
  log: 'warn',
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
  .use('@seneca/transport')
  .use(color)

seneca.listen(
  {
    type: 'web',
    port: 8273,
    host: '127.0.0.1',
    protocol: 'https',
    pin: 'role:color,cmd:*',
    serverOptions, // passed to https.createServer
  },
  function (err, out) {
    if (err) {
      console.error('ERROR', err.message)
      return seneca.close()
    }
    console.log('color service listening on https://127.0.0.1:' + out.port + '/act')
  },
)
```

```
$ node https-service.js certs
color service listening on https://127.0.0.1:8273/act
```

`serverOptions` can also be set once for all listeners as the plugin
option `web.serverOptions`. Give `protocol: 'https'` in the `listen`
call itself: on Seneca 4.0.0-rc5 the core supplies `protocol: 'http'`
to every configuration, which overrides a `web.protocol` plugin option.

## 3. The client

The client needs `protocol: 'https'`:

```js
const seneca = Seneca({ tag: 'client', log: 'warn', timeout: 5000 })
  .use('@seneca/transport')
  .client({ type: 'web', port: 8273, host: '127.0.0.1', protocol: 'https', pin: 'role:color,cmd:*' })

seneca.ready(async function () {
  try {
    console.log(await seneca.post('role:color,cmd:hex,name:green'))
  } catch (err) {
    console.log('ERROR', err.code, err.message)
    process.exitCode = 1
  } finally {
    await seneca.close()
  }
})
```

The client has no TLS options of its own: it trusts the certificate
authorities Node.js trusts. With the self-signed certificate the call
fails; after the JSON log entry for the failed call, the client prints:

```
$ node https-client.js
ERROR DEPTH_ZERO_SELF_SIGNED_CERT Client request error: self-signed certificate; if the root CA is installed locally, try running Node.js with --use-system-ca
```

Make Node.js trust the certificate with `NODE_EXTRA_CA_CERTS`:

```
$ NODE_EXTRA_CA_CERTS=certs/cert.pem node https-client.js
{ name: 'green', hex: '#00FF00' }
```

Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`; it disables certificate
checking for the whole process.

## 4. From curl

```
$ curl -s --cacert certs/cert.pem -X POST https://127.0.0.1:8273/act \
    -H 'Content-Type: application/json' -d '{"role":"color","cmd":"list"}'
{"names":["red","green","blue"]}
```

## 5. Keep the key out of the logs

When the port is in use, the listener's retry warnings log the complete
listen configuration, including `serverOptions`. Do not run HTTPS
listeners where another process may hold the port, or collect the logs
privately.
