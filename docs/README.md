# @seneca/transport documentation

The documentation follows the [Diátaxis](https://diataxis.fr/) structure:
four sections with four different jobs. Start with the tutorial if you
are new to the plugin; use the how-to guides for specific tasks; look
things up in the reference; read the explanations to understand the
design. The core side of transports (`seneca.listen`, `seneca.client`,
pins, routing) is documented in Seneca itself, in particular
[Use network transports](https://github.com/senecajs/seneca/blob/master/docs/how-to/use-network-transports.md),
the [Transport reference](https://github.com/senecajs/seneca/blob/master/docs/reference/transport.md)
and the [Message transport protocol](https://github.com/senecajs/seneca/blob/master/docs/reference/message-transport-protocol.md).

## Tutorials

| Tutorial | What you build |
| -------- | -------------- |
| [Getting started](tutorials/getting-started.md) | A service and a client in one process, then as two processes over HTTP, then over TCP. |

The programs are in [examples](examples/). Each was run against Seneca
4.0.0-rc5 on Node.js 24 and 22 and against 4.0.0; the outputs quoted
are from 4.0.0-rc5 on Node.js 24. Inside the repository they load the
plugin with `require('../..')`; in your own code write
`require('@seneca/transport')`.

## How-to guides

| Guide | Covers |
| ----- | ------ |
| [Choose and configure a transport type](how-to/choose-and-configure-a-transport-type.md) | `web` versus `tcp`, the `http` and `direct` aliases, plugin options, core `transport` options, precedence, function values. |
| [Listen on a specific host, port and path](how-to/listen-on-a-host-port-and-path.md) | Interfaces, fixed and free ports, HTTP paths, UNIX domain sockets. |
| [Use HTTPS](how-to/use-https.md) | A self-signed certificate, `protocol: 'https'`, `serverOptions`, trusting the certificate on the client and in curl. |
| [Call a listener from curl or another non-Seneca client](how-to/call-a-listener-without-seneca.md) | JSON bodies, query parameters, error bodies, answering Seneca clients from your own server, a raw TCP client. |
| [Pass errors between services](how-to/pass-errors-between-services.md) | What arrives on the client: message, code, details, status; Seneca 3 callers; results instead of errors. |
| [Tune timeouts, retries and message checks](how-to/tune-timeouts-retries-and-message-checks.md) | The three timeouts, `EADDRINUSE` retries, `callmax`, `check` and `warn`, fire and forget. |
| [Shut down cleanly](how-to/shut-down-cleanly.md) | `close`, signals, released ports, remote close. |
| [Run on Seneca 3 and Seneca 4](how-to/run-on-seneca-3-and-4.md) | Loading the plugin once, a callback style client that runs on both, error shapes, hosts. |
| [Migrate from Seneca 3](how-to/migrate-from-seneca-3.md) | The package rename, removed options, the 8.4 fixes, error handling, HTTP paths in the shared options. |
| [Write a transport plugin](how-to/write-a-transport-plugin.md) | An in-memory transport built on the `transport/utils` export. |
| [Create a release](how-to/create-a-release.md) | For maintainers: publishing with the `repo-publish` scripts. |

## Reference

| Reference | Describes |
| --------- | --------- |
| [Options](reference/options.md) | Every plugin option and every `listen`/`client` configuration key, with defaults, and how they are combined. |
| [Messages](reference/messages.md) | Every action pattern and hook: parameters, replies, errors, close hooks. |
| [HTTP protocol](reference/http-protocol.md) | Request and response headers, bodies, status codes, query parameters, timeouts, security. |
| [TCP protocol](reference/tcp-protocol.md) | ndjson frames, request and response envelopes, listener and client behaviour, reconnect. |
| [Utilities](reference/utils.md) | Every method of the `transport/utils` export. |
| [Errors](reference/errors.md) | Every error code, warning entry and related core error. |

## Explanation

| Explanation | Topic |
| ----------- | ----- |
| [How a message travels](explanation/message-lifecycle.md) | The envelope, the call map and message ids, the checks, loop detection and its limits, closing, what is not recorded. |
| [Errors on the wire](explanation/errors-on-the-wire.md) | Why errors are flattened, what survives, HTTP status mapping, the `statusCode` quirk. |
| [Seneca 3 versus 4](explanation/seneca-3-versus-4.md) | Loading and the package name, type aliases, the shared `transport` options, precedence and the `path` quirk, close hooks, errors, promises. |

## Feature index

Every option, configuration key, action pattern, export, error code and
protocol header of the plugin, with the page that documents it.

| Feature | Kind | Documented in |
| ------- | ---- | ------------- |
| `msgprefix` | plugin option | [Options](reference/options.md#top-level), [Utilities](reference/utils.md#listener-side) |
| `callmax` | plugin option | [Options](reference/options.md#top-level), [Tune timeouts, retries and message checks](how-to/tune-timeouts-retries-and-message-checks.md) |
| `msgidlen` | plugin option | [Options](reference/options.md#top-level) |
| `warn.unknown_message_id`, `warn.invalid_kind`, `warn.invalid_origin`, `warn.no_message_id`, `warn.message_loop`, `warn.own_message` | plugin options | [Options](reference/options.md#warn), [Errors](reference/errors.md) |
| `check.message_loop`, `check.own_message` | plugin options | [Options](reference/options.md#check), [How a message travels](explanation/message-lifecycle.md#6-loop-detection-and-its-limits) |
| `web.type`, `web.port`, `web.host`, `web.path`, `web.protocol` | plugin options | [Options](reference/options.md#web) |
| `web.timeout` | plugin option | [Options](reference/options.md#web), [HTTP protocol](reference/http-protocol.md#timeouts) |
| `web.max_listen_attempts`, `web.attempt_delay` | plugin options | [Options](reference/options.md#web), [Tune timeouts, retries and message checks](how-to/tune-timeouts-retries-and-message-checks.md) |
| `web.serverOptions` | plugin option | [Options](reference/options.md#web), [Use HTTPS](how-to/use-https.md) |
| `web.headers` | plugin option | [Options](reference/options.md#web), [HTTP protocol](reference/http-protocol.md#request) |
| `tcp.type`, `tcp.host`, `tcp.port`, `tcp.timeout` | plugin options | [Options](reference/options.md#tcp), [TCP protocol](reference/tcp-protocol.md#listener) |
| `tcp.path` | plugin option (no default) | [Options](reference/options.md#the-tcp-path), [Listen on a specific host, port and path](how-to/listen-on-a-host-port-and-path.md#4-unix-domain-socket-tcp-only) |
| `tcp.max_listen_attempts`, `tcp.attempt_delay` | plugin options (no default) | [Options](reference/options.md#tcp), [Tune timeouts, retries and message checks](how-to/tune-timeouts-retries-and-message-checks.md) |
| `type` (`web`, `http`, `direct`, `tcp`; `pubsub` and `queue` rejected) | configuration key | [Options](reference/options.md#configuration-keys-of-listen-and-client), [Choose and configure a transport type](how-to/choose-and-configure-a-transport-type.md) |
| `port`, `host`, `path`, `protocol` | configuration keys | [Options](reference/options.md#configuration-keys-of-listen-and-client), [Listen on a specific host, port and path](how-to/listen-on-a-host-port-and-path.md) |
| `pin`, `pins` | configuration keys | [Options](reference/options.md#configuration-keys-of-listen-and-client), [HTTP protocol](reference/http-protocol.md#security) |
| `timeout` (client configuration) | configuration key | [Options](reference/options.md#configuration-keys-of-listen-and-client), [HTTP protocol](reference/http-protocol.md#timeouts) |
| `serverOptions`, `max_listen_attempts`, `attempt_delay` | configuration keys | [Options](reference/options.md#configuration-keys-of-listen-and-client) |
| `id`, `override`, `makehandle` | configuration keys (core) | [Options](reference/options.md#configuration-keys-of-listen-and-client) |
| Shared `transport` options of Seneca core (`port`, `host`, `path`, `protocol`, `transport.web`, `transport.tcp`) and their precedence | core options | [Options](reference/options.md#how-a-configuration-is-resolved), [Seneca 3 versus 4](explanation/seneca-3-versus-4.md#the-shared-transport-options) |
| `default_plugins: { transport: false }` (Seneca 3: skip the bundled `seneca-transport`) | core option | [Run on Seneca 3 and Seneca 4](how-to/run-on-seneca-3-and-4.md#1-load-the-plugin-explicitly-and-only-once), [Seneca 3 versus 4](explanation/seneca-3-versus-4.md#who-loads-the-plugin-and-under-which-name) |
| `sync$`, `local$`, `custom$`, `transport$`, `id$` | message directives | [Options](reference/options.md#message-directives-read-by-the-plugin), [How a message travels](explanation/message-lifecycle.md) |
| `role:transport,cmd:listen` | action | [Messages](reference/messages.md#roletransportcmdlisten) |
| `role:transport,cmd:client` | action | [Messages](reference/messages.md#roletransportcmdclient) |
| `role:transport,cmd:inflight` | action | [Messages](reference/messages.md#roletransportcmdinflight) |
| `role:transport,hook:listen,type:web` (`http`, `direct`) | hook | [Messages](reference/messages.md#roletransporthooklistentypeweb-http-direct), [HTTP protocol](reference/http-protocol.md) |
| `role:transport,hook:listen,type:tcp` | hook | [Messages](reference/messages.md#roletransporthooklistentypetcp), [TCP protocol](reference/tcp-protocol.md#listener) |
| `role:transport,hook:client,type:web` (`http`, `direct`) | hook | [Messages](reference/messages.md#roletransporthookclienttypeweb-http-direct), [HTTP protocol](reference/http-protocol.md#how-the-client-reads-a-response) |
| `role:transport,hook:client,type:tcp` | hook | [Messages](reference/messages.md#roletransporthookclienttypetcp), [TCP protocol](reference/tcp-protocol.md#client) |
| `sys:seneca,cmd:close` / `role:seneca,cmd:close` priors | close hooks | [Messages](reference/messages.md#close-hooks), [Shut down cleanly](how-to/shut-down-cleanly.md) |
| `seneca.export('transport/utils')` | export | [Utilities](reference/utils.md), [Write a transport plugin](how-to/write-a-transport-plugin.md) |
| `handle_request`, `requestAct`, `prepareResponse`, `update_output`, `catch_act_error`, `serializeError`, `listen_topics` | utility methods | [Utilities](reference/utils.md#listener-side) |
| `make_client`, `prepare_request`, `handle_response`, `callmeta`, `resolve_pins`, `make_argspatrun`, `make_resolvesend`, `resolve_topic` (`resolvetopic`), `make_anyclient`, `make_pinclient` | utility methods | [Utilities](reference/utils.md#client-side) |
| `close`, `closePattern`, `handle_entity`, `stringifyJSON`, `parseJSON`, `resolveDynamicValue`, `error` | utility methods | [Utilities](reference/utils.md#shared-helpers) |
| `no_data`, `invalid_kind_act`, `no_message_id`, `invalid_origin`, `unknown_message_id`, `own_message`, `message_loop`, `data_error`, `invalid_json`, `unexcepted_async_error` | error codes | [Errors](reference/errors.md#codes-defined-by-the-plugin) |
| `plugin-needed`, `null-client` | error codes | [Errors](reference/errors.md#codes-created-with-senecafail) |
| `invalid_kind_res`, `callback_error`, `listen attempt`, `net-error`, `pipe-error`, `act-error`, `json-stringify`, `json-parse` | log entries | [Errors](reference/errors.md#log-entries-that-are-not-errors) |
| `transport_listen`, `transport_client`, `transport_client_null`, `action_timeout`, `Client request timeout`, `Client request error`, `Response Error` | related core and library errors | [Errors](reference/errors.md#errors-from-seneca-core-and-libraries), [HTTP protocol](reference/http-protocol.md#how-the-client-reads-a-response) |
| `seneca-id`, `seneca-kind`, `seneca-origin`, `seneca-track`, `seneca-time-client-sent` | request headers | [HTTP protocol](reference/http-protocol.md#request) |
| `seneca-id`, `seneca-kind`, `seneca-origin`, `seneca-accept`, `seneca-track`, `seneca-time-client-sent`, `seneca-time-listen-recv`, `seneca-time-listen-sent`, `Content-Type`, `Cache-Control`, `Content-Length` | response headers | [HTTP protocol](reference/http-protocol.md#response) |
| Query parameters, `msg$`, `args$` | HTTP request | [HTTP protocol](reference/http-protocol.md#requests-from-other-clients), [Call a listener from curl](how-to/call-a-listener-without-seneca.md) |
| HTTP status codes (200, `statusCode`, 500, 404, 503) | HTTP response | [HTTP protocol](reference/http-protocol.md#status-codes), [Errors on the wire](explanation/errors-on-the-wire.md) |
| Request and response envelopes (`id`, `kind`, `origin`, `track`, `time`, `act`, `sync`, `msg$`, `accept`, `res`, `error`, `input`) | TCP frames | [TCP protocol](reference/tcp-protocol.md#frames), [How a message travels](explanation/message-lifecycle.md#2-the-envelope) |
| Reconnect, UNIX domain sockets | TCP behaviour | [TCP protocol](reference/tcp-protocol.md), [Listen on a specific host, port and path](how-to/listen-on-a-host-port-and-path.md) |
| HTTPS (`protocol: 'https'`, `NODE_EXTRA_CA_CERTS`) | HTTP behaviour | [Use HTTPS](how-to/use-https.md), [HTTP protocol](reference/http-protocol.md#https) |
| Entities (`entity$`) | data conversion | [Utilities](reference/utils.md#shared-helpers) |

## Other documents

* [Change log](../CHANGES.md)
* [Code of conduct](../CODE_OF_CONDUCT.md)
* [License](../LICENSE)
* [Workflow patches](../.patches/README.md)
