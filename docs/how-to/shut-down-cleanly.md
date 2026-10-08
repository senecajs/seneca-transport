# Shut down cleanly

Goal: stop a process that listens or has clients so that sockets are
released and the process exits.

## 1. Close every instance

```js
await seneca.close()
// or
seneca.close(function (err) { ... })
```

`close()` runs the close hooks the plugin registered for each listener
and client: HTTP servers stop listening, TCP servers stop listening and
destroy their connections, TCP clients disconnect. When every instance
in the process is closed nothing keeps the event loop alive and the
process exits. The one-process examples end this way:

```js
await client.close()
await service.close()
```

The port is free again immediately; listening on it right after
`close()` succeeds (verified).

## 2. Close on signals

For a service, let Seneca close the instance when the process is asked
to stop:

```js
Seneca({
  system: { close_signals: { SIGTERM: true, SIGINT: true } },
})
```

The process exits with code 0 after closing. Verified with
[http-service.js](../examples/http-service.js): `kill -TERM <pid>`
ended the process with exit code 0, and the same for the TCP and HTTPS
services. Without the option, a signal ends the process at once with
the default exit code (143 for SIGTERM); the operating system releases
the sockets anyway, but in-flight actions are cut off and plugin close
hooks do not run.

To run your own code first, handle the signal yourself:

```js
process.on('SIGTERM', async () => {
  await seneca.close()
  process.exit(0)
})
```

## 3. Bound the wait

`close()` waits up to `close_delay` (default 22222 ms) for in-flight
actions. Lower it if actions may hang:

```js
Seneca({ close_delay: 5000 })
```

## 4. Seneca 3 and 4

The plugin registers its hooks on `sys:seneca,cmd:close` on Seneca 4
and on `role:seneca,cmd:close` on Seneca 3, chosen from `seneca.version`,
so `close()` releases the sockets on both. This matters on Seneca
4.0.0-rc5, which never calls hooks on the Seneca 3 pattern (version 8.3
of this plugin left listeners open there).

## 5. Remote close

An inbound `sys:seneca,cmd:close` message makes a listener run the same
hooks, so a client that can reach the port can close the sockets of a
service (the instance itself is not marked closed). Keep listeners on
trusted networks; see [Security](../reference/http-protocol.md#security).

## 6. Scripts and tests

Close every instance a script or test creates, including clients, on
the failure path as well as on success: a TCP client's connection keeps
the process alive until it is closed. The examples put the `close()`
calls in a `finally` block:

```js
seneca.ready(async function () {
  try {
    console.log(await seneca.post('role:color,cmd:list'))
  } catch (err) {
    console.error('ERROR', err.message)
    process.exitCode = 1
  } finally {
    await seneca.close()
  }
})
```

A TCP client that never managed to connect (the service was down) is
slower to let go: `close()` logs an error entry, because there is no
connection to destroy, and the process exits only when the client's
next reconnect attempt is due. The delay between attempts grows from
1 second to at most 30 seconds; with the service down,
[tcp-client.js](../examples/tcp-client.js) failed with `action_timeout`
after 22 seconds and the process exited 11 seconds later.

The Seneca guide [Shut down gracefully](https://github.com/senecajs/seneca/blob/master/docs/how-to/shut-down-gracefully.md)
covers the core side: `close_delay`, `destroy`, fatal errors.
