![Seneca](http://senecajs.org/files/assets/seneca-logo.png)
> A [Seneca.js][] plugin

# @seneca/transport

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

## Install

This plugin is included in the main Seneca module:

```sh
npm install seneca
```

To install separately:

```sh
npm install seneca-transport
```

## Quick Example

Let's do everything in one script to begin with. You'll define a
simple Seneca plugin that returns the hex value of color words. In
fact, all it can handle is the color red!

You define the action pattern _color:red_, which always returns the
result <code>{hex:'#FF0000'}</code>. You're also using the name of the
function _color_  to define the name of the plugin (see [How to write a
Seneca plugin](http://senecajs.org/docs/tutorials/how-to-write-a-plugin.html)).

```js
function color() {
  this.add( 'color:red', function(args,done){
    done(null, {hex:'#FF0000'});
  })
}
```

Now, let's create a server and client. The server Seneca instance will
load the _color_  plugin and start a web server to listen for inbound
messages. The client Seneca instance will submit a _color:red_ message
to the server.


```js
var seneca = require('seneca')

seneca()
  .use(color)
  .listen()

seneca()
  .client()
  .act('color:red')
```

Example with HTTPS:

To enable HTTPS, pass an options object to the `listen` function setting the `protocol` option to 'https' and provide a `serverOptions` object with `key` and `cert` properties.

```js
var seneca = require('seneca')
var Fs = require('fs')


seneca()
  .use(color)
  .listen({
    type: 'http',
    port: '8000',
    host: 'localhost',
    protocol: 'https',
    serverOptions : {
      key : Fs.readFileSync('path/to/key.pem', 'utf8'),
      cert : Fs.readFileSync('path/to/cert.pem', 'utf8')
    }
  })

seneca()
  .client({
    type: 'http',
    port: '8000',
    host: 'localhost',
    protocol: 'https'
  })
  .act('color:red')
```

You can create multiple instances of Seneca inside the same Node.js
process. They won't interfere with each other, but they will share
external options from configuration files or the command line.

If you run the full script (full source is in
[readme-color.js](https://github.com/senecajs/seneca-transport/blob/master/test/stubs/readme-color.js)),
you'll see the standard Seneca startup log messages, but you won't see
anything that tells you what the _color_ plugin is doing since this
code doesn't bother printing the result of the action. Let's use a
filtered log to output the inbound and outbound action messages from
each Seneca instance so we can see what's going on. Run the script with:

```sh
node readme-color.js --seneca.log=type:act,regex:color:red
```

_NOTE: when running the examples in this documentation, you'll find
that most of the Node.js processes do not exit. This because they
running in server mode. You'll need to kill all the Node.js processes
between execution runs. The quickest way to do this is:_

```sh
$ killall node
```


This log filter restricts printed log entries to those that report
inbound and outbound actions, and further, to those log lines that
match the regular expression <code>/color:red/</code>. Here's what
you'll see:

```sh
[TIME] vy../..15/- DEBUG act -     - IN  485n.. color:red {color=red}   CLIENT
[TIME] ly../..80/- DEBUG act color - IN  485n.. color:red {color=red}   f2rv..
[TIME] ly../..80/- DEBUG act color - OUT 485n.. color:red {hex=#FF0000} f2rv..
[TIME] vy../..15/- DEBUG act -     - OUT 485n.. color:red {hex=#FF0000} CLIENT
```

The second field is the identifier of the Seneca instance. You can see
that first the client (with an identifier of _vy../..15/-_) sends the
message <code>{color=red}</code>. The message is sent over HTTP to the
server (which has an identifier of _ly../..80/-_). The server performs the
action, generating the result <code>{hex=#FF0000}</code>, and sends
it back.

The third field, <code>DEBUG</code>, indicates the log level. The next
field, <code>act</code> indicates the type of the log entry. Since
you specified <code>type:act</code> in the log filter, you've got a
match!

The next two fields indicate the plugin name and tag, in this case <code>color
-</code>. The plugin is only known on the server side, so the client
just indicates a blank entry with <code>-</code>. For more details on
plugin names and tags, see [How to write a Seneca
plugin](http://senecajs.org/tutorials/how-to-write-a-plugin.html).

The next field (also known as the _case_) is either <code>IN</code> or
<code>OUT</code>, and indicates the direction of the message. If you
follow the flow, you can see that the message is first inbound to the
client, and then inbound to the server (the client sends it
onwards). The response is outbound from the server, and then outbound
from the client (back to your own code). The field after that,
<code>485n..</code>, is the message identifier. You can see that it
remains the same over multiple Seneca instances. This helps you to
debug message flow.

The next two fields show the action pattern of the message, 
<code>color:red</code>, followed by the actual data of the request
message (when inbound), or the response message (when outbound).

The last field <code>f2rv..</code> is the internal identifier of the
action function that acts on the message. On the client side, there is
no action function, and this is indicated by the <code>CLIENT</code>
marker. If you'd like to match up the action function identifier to
message executions, add a log filter to see them:

```
node readme-color.js --seneca.log=type:act,regex:color:red \
--seneca.log=plugin:color,case:ADD
[TIME] ly../..80/- DEBUG plugin color - ADD f2rv.. color:red
[TIME] vy../..15/- DEBUG act    -     - IN  485n.. color:red {color=red}   CLIENT
[TIME] ly../..80/- DEBUG act    color - IN  485n.. color:red {color=red}   f2rv..
[TIME] ly../..80/- DEBUG act    color - OUT 485n.. color:red {hex=#FF0000} f2rv..
[TIME] vy../..15/- DEBUG act    -     - OUT 485n.. color:red {hex=#FF0000} CLIENT
```

The filter <code>plugin:color,case:ADD</code> picks out log entries of
type _plugin_, where the plugin has the name _color_, and where the
_case_ is ADD. These entries indicate the action patterns that a
plugin has registered. In this case, there's only one, _color:red_.

You've run this example in a single Node.js process up to now. Of
course, the whole point is to run it in separate processes! Let's do
that. First, here's the server:

```js
function color() {
  this.add( 'color:red', function(args,done){
    done(null, {hex:'#FF0000'});
  })
}

var seneca = require('seneca')

seneca()
  .use(color)
  .listen()
```

Run this in one terminal window with:

```sh
$ node readme-color-service.js --seneca.log=type:act,regex:color:red
```

And on the client side:

```js
var seneca = require('seneca')

seneca()
  .client()
  .act('color:red')
```

And run with:

```sh
$ node readme-color-client.js --seneca.log=type:act,regex:color:red
```

You'll see the same log lines as before, just split over the two processes. The full source code is the [test folder](https://github.com/senecajs/seneca-transport/tree/master/test).

## More Examples

See [test/](test/) for usage examples.

## Motivation

This plugin provides the HTTP/HTTPS and TCP transport channels for micro-service messages. It is a built-in dependency of the Seneca module.

## Support

If you're using this module and need help, you can:

- Post a [github issue][]
- Tweet to [@senecajs][]
- Ask on the [Gitter][gitter-url]

## API

See [senecajs.org](http://senecajs.org) for full documentation on transport options.

### Plugin Options

Primary options:

- `msgprefix`: string to prefix topic names
- `callmax`: maximum number of in-flight request/response messages
- `msgidlen`: length of message identifier string

## Contributing

The [Senecajs org][] encourages open participation. If you feel you can help in any way, be it with documentation, examples, extra testing, or new features please get in touch.

### Running tests

```sh
npm run test
```

### Testing with Docker Compose

```sh
docker-compose build
docker-compose up
```

## Background

This plugin supports HTTP, HTTPS and TCP channels. See also [seneca-redis-transport](https://github.com/senecajs/seneca-redis-transport) and [seneca-beanstalk-transport](https://github.com/senecajs/seneca-beanstalk-transport).

[![npm version][npm-badge]][npm-url]
[![Build Status][travis-badge]][travis-url]
[![Dependency Status][david-badge]][david-url]
[![Gitter][gitter-badge]][gitter-url]
[readme-color.js](https://github.com/senecajs/seneca-transport/blob/master/test/stubs/readme-color.js)),
[TIME] vy../..15/- DEBUG act -     - IN  485n.. color:red {color=red}   CLIENT
[TIME] ly../..80/- DEBUG act color - IN  485n.. color:red {color=red}   f2rv..
[TIME] ly../..80/- DEBUG act color - OUT 485n.. color:red {hex=#FF0000} f2rv..
[TIME] vy../..15/- DEBUG act -     - OUT 485n.. color:red {hex=#FF0000} CLIENT
[TIME] ly../..80/- DEBUG plugin color - ADD f2rv.. color:red
[TIME] vy../..15/- DEBUG act    -     - IN  485n.. color:red {color=red}   CLIENT
[TIME] ly../..80/- DEBUG act    color - IN  485n.. color:red {color=red}   f2rv..
[TIME] ly../..80/- DEBUG act    color - OUT 485n.. color:red {hex=#FF0000} f2rv..
[TIME] vy../..15/- DEBUG act    -     - OUT 485n.. color:red {hex=#FF0000} CLIENT
[readme-color-tcp.js](https://github.com/senecajs/seneca-transport/blob/master/test/stubs/readme-color-tcp.js)
[TIME] 6g../..49/- INFO  hello  Seneca/0.5.20/6g../..49/-
[TIME] f1../..79/- INFO  hello  Seneca/0.5.20/f1../..79/-
[TIME] f1../..79/- DEBUG act    -         - IN  wdfw.. color:red {color=red} CLIENT
[TIME] 6g../..49/- INFO  plugin transport - ACT b01d.. listen open {type=tcp,host=0.0.0.0,port=10201,...}
[TIME] f1../..79/- INFO  plugin transport - ACT nid1.. client {type=tcp,host=0.0.0.0,port=10201,...} any
[TIME] 6g../..49/- INFO  plugin transport - ACT b01d.. listen connection {type=tcp,host=0.0.0.0,port=10201,...} remote 127.0.0.1 52938
[TIME] 6g../..49/- DEBUG act    color     - IN  bpwi.. color:red {color=red} mcx8i4slu68z UNGATE
[TIME] 6g../..49/- DEBUG act    color     - OUT bpwi.. color:red {hex=#FF0000} mcx8i4slu68z
[TIME] f1../..79/- DEBUG act    -         - OUT wdfw.. color:red {hex=#FF0000} CLIENT
[readme-many-colors-server.js](https://github.com/senecajs/seneca-transport/blob/master/test/stubs/readme-many-colors-server.js)):
[TIME] mi../..66/- INFO  hello  Seneca/0.5.20/mi../..66/-
[TIME] mi../..66/- INFO  color  red       FF0000 8081
[TIME] mi../..66/- INFO  plugin transport -      ACT 7j.. listen {type=web,port=8081,host=0.0.0.0,path=/act,protocol=http,timeout=32778,msgprefix=seneca_,callmax=111111,msgidlen=12,role=transport,hook=listen}
[TIME] mi../..66/- DEBUG act    -         -      IN  ux.. color:red {color=red} 9l..
[TIME] mi../..66/- DEBUG act    -         -      OUT ux.. color:red {hex=#FF0000} 9l..
[readme-many-colors.sh](https://github.com/senecajs/seneca-transport/blob/master/test/stubs/readme-many-colors.sh)
[transport.js](transport.js) for implementation examples.
[npm-badge]: https://img.shields.io/npm/v/seneca-transport.svg
[npm-url]: https://npmjs.com/package/seneca-transport
[travis-badge]: https://travis-ci.org/senecajs/seneca-transport.svg
[travis-url]: https://travis-ci.org/senecajs/seneca-transport
[gitter-badge]: https://badges.gitter.im/Join%20Chat.svg
[gitter-url]: https://gitter.im/senecajs/seneca
[david-badge]: https://david-dm.org/senecajs/seneca-transport.svg
[david-url]: https://david-dm.org/senecajs/seneca-transport
[MIT]: ./LICENSE
[Senecajs org]: https://github.com/senecajs/
[Seneca.js]: https://www.npmjs.com/package/seneca
[senecajs.org]: http://senecajs.org/
[leveldb]: http://leveldb.org/
[github issue]: https://github.com/senecajs/seneca-transport/issues
[@senecajs]: http://twitter.com/senecajs
