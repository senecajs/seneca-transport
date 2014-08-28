seneca-transport - a [Seneca](http://senecajs.org) plugin
======================================================

## Seneca Transport Plugin

This plugin provides the HTTP and TCP transport channels for
micro-service messages. It's a built-in dependency of the Seneca
module, so you don't need to include it manually. You use this plugin
to wire up your micro-services so that they can talk to each other.

[![Build Status](https://travis-ci.org/rjrodger/seneca-transport.png?branch=master)](https://travis-ci.org/rjrodger/seneca-transport)

[![NPM](https://nodei.co/npm/seneca-transport.png)](https://nodei.co/npm/seneca-transport/)
[![NPM](https://nodei.co/npm-dl/seneca-transport.png)](https://nodei.co/npm-dl/seneca-transport/)

For a gentle introduction to Seneca itself, see the
[senecajs.org](http://senecajs.org) site.

If you're using this plugin module, feel free to contact me on twitter if you
have any questions! :) [@rjrodger](http://twitter.com/rjrodger)

Current Version: 0.2.3

Tested on: Seneca 0.5.19, Node 0.10.29


### Install

This plugin module is included in the main Seneca module:

```sh
npm install seneca
```

To install separately, use:

```sh
npm install seneca-transport
```


## Quick Example

Let's do everything in one script to begin with. You'll define a
simple Seneca plugin that returns the hex value of color words. In
fact, all it can handle is the color red!

You define the action pattern _color:red_, which aways returns the
result <code>{hex:'#FF0000'}</code>. You're also using the name of the
function _color_ to define the name of the plugin (see [How to write a
Seneca plugin](http://senecajs.org)).

```js
function color() {
  this.add( 'color:red', function(args,done){
    done(null, {hex:'#FF0000'});
  })
}
```

Now, let's create a server and client. The server Seneca instance will
load the _color_ plugin and start a web server to listen for inbound
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

You can create multiple instances of Seneca inside the same Node.js
process. They won't interfere with each other, but they will share
external options from configurations files or the command line.

If you run the full script (Full source is in
[readme-color.js](https://github.com/rjrodger/seneca-transport/blob/master/test/readme-color.js)),
you'll see the standard Seneca startup log messages, but you won't see
anything that tells you what the _color_ plugin is doing, since this
code doesn't bother printing the result of the action. Let's use a
filtered log to output the inbound and outbound action messages from
each Seneca instance so we can see what's going on. Run the script with:

```sh
node readme-color.js --seneca.log=type:act,regex:color=red
```

This log filter restricts printed log entries to those that report
inbound and outbound actions, and further, to those log lines that
match the regular expression <code>/color=red/<code>. Here's what you'll see:

```sh
[TIME] vy../..15/- DEBUG act -     - IN  485n.. color:red {color=red}   CLIENT 
[TIME] ly../..80/- DEBUG act color - IN  485n.. color:red {color=red}   f2rv..
[TIME] ly../..80/- DEBUG act color - OUT 485n.. color:red {hex=#FF0000} f2rv..
[TIME] vy../..15/- DEBUG act -     - OUT 485n.. color:red {hex=#FF0000} CLIENT
```

The second field is the identifier of the Seneca instance. You can see
that first the client _vy../..15/-_ sends the message
<code>{color=red}</code>. The message is sent over HTTP to the server
_ly../..80/-_. The server performs the action, generating the result
<code>{hex=#FF0000}</code>, and sending it back.

The third field, <code>DEBUG</code>, indicates the log level. The next
fields, <code>act</code> indicates the type of the log entry. Since
you specified <code>type:act</code> in the log filter, you've got a
match!

The next two fields indicate the plugin name and tag <code>color
-</code>. The plugin is only known on the server side, so the client
just indicates a blank entry with <code>-</code>. For more details on
plugin names and tags, see [How to write a Seneca
plugin](http://senecajs.org).

The next field is either <code>IN</code> or <code>OUT</code>, and
indicates the direction of the message. If you follow the flow, you
can see that the message is first inbound to the client, and then
inbound to the server (the client sends it onwards). The response is
outbound from the server, and then outbound from the client (back to
your own code). The field after that, <code>485n..</code>, is the
message identifier. You can see that it remains the same over multiple
Seneca instances. This helps you to debug message flow.

The next two fields show the action pattern of the message
<code>color:red</code>, followed by the actual data of the request
message (when inbound), or the response message (when outbound).





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



