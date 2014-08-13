# seneca-transport

## An action transport plugin for the [Seneca](http://senecajs.org) framework

This plugin allows you to execute Seneca actions in separate Seneca processes. The default transport
mechanism is HTTP. Redis publish-subscribe is also built-in.

This plugin provides the implementation for the <i>listen</i>, <i>client</i>, and <i>proxy</i> convenience methods on the
Seneca object. It is included as a dependent module of the Seneca module.

You can provide your own transport mechanisms by overriding the transport action patterns (see below).


## Support

If you're using this module, feel free to contact me on Twitter if you
have any questions! :) [@rjrodger](http://twitter.com/rjrodger)

Current Version: 0.2.3

Tested on: Node 0.10.29, Seneca 0.5.18

[![Build Status](https://travis-ci.org/rjrodger/seneca-transport.png?branch=master)](https://travis-ci.org/rjrodger/seneca-transport)



## Quick example

First, define a service (this is just a Seneca plugin):

```JavaScript
module.exports = function() {
  this.add( 'foo:1', function(args,done){done(null,{s:'1-'+args.bar})} )
  this.add( 'foo:2', function(args,done){done(null,{s:'2-'+args.bar})} )
}
```

Start the service:

```JavaScript
require('seneca')()
  .use('foo')
  .listen()
```

And talk to it:

```JavaScript
require('seneca')()
    .client()
    .act('foo:1,bar:A',function(err,out){console.log(out)})
    .act('foo:2,bar:B',function(err,out){console.log(out)})
```

And this prints:

```sh
1-A
2-B
```


To run this example, try in one terminal

```sh
node test/service-foo.js
```

and in another:

```sh
node test/client-foo.js
```




## Install

This module is included in the standard Seneca module, so install using that:

```sh
npm install seneca
```



## Action Patterns

### role:transport, cmd:listen

Starts listening for actions. The <i>type</i> argument specifies the
transport mechanism. Current built-ins are <i>direct</i> (which is
HTTP), and <i>pubsub</i> (which is Redis).


### role:transport, cmd:client

Create a Seneca instance that sends actions to a remote service.  The
<i>type</i> argument specifies the transport mechanism.


## Hook Patterns

These patterns are called by the primary action patterns. Add your own for additional transport mechanisms. For example, [seneca-redis-transport](http://github.com/rjrodger/seneca-redis-transport) defines:

   * role:transport, hook:listen, type:redis
   * role:transport, hook:client, type:redis

These all take additional configuration arguments, which are passed through from the primary actions:

   * host
   * port
   * path
   * any other configuration you need


## Pattern Selection

If you only want to transport certain action patterns, use the <i>pin</i> argument to pick these out. See the
<i>test/client-pubsub-foo.js</i> and <i>test/service-pubsub-foo.js</i> files for an example.



## Logging

To see what this plugin is doing, try:

```sh
node your-app.js --seneca.log=plugin:transport
```

To skip the action logs, use:

```sh
node your-app.js --seneca.log=type:plugin,plugin:transport
```

For more on logging, see the [seneca logging example](http://senecajs.org/logging-example.html).


## Test

This module itself does not contain any direct reference to seneca, as
it is a seneca dependency. However, seneca is needed to test it, so
the test script will perform an _npm install seneca_ (if needed). This is not
saved to _package.json_ however.

```sh
npm test
```



