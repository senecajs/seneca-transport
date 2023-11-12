"use strict";
/* Copyright © 2021-2023 Richard Rodger, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = __importDefault(require("node:util"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_url_1 = __importDefault(require("node:url"));
const qs_1 = __importDefault(require("qs"));
const wreck_1 = __importDefault(require("@hapi/wreck"));
function transport(options) {
    let seneca = this;
    const root = seneca.root;
    const Jsonic = seneca.util.Jsonic;
    const { stringifyJSON, parseJSON, externalize_msg, externalize_reply, internalize_msg, internalize_reply, close, info, } = seneca.export('transport/utils');
    seneca.add('role:transport,hook:listen,type:web', hook_listen_web);
    seneca.add('role:transport,hook:client,type:web', hook_client_web);
    // function hook_listen_web(config, ready) {
    function hook_listen_web(msg, reply) {
        const seneca = this.root.delegate();
        const transport_options = seneca.options().transport;
        const config = seneca.util.deep(msg);
        config.port = null == config.port ? transport_options.port : config.port;
        config.modify_response = config.modify_response || web_modify_response;
        const server = 'https' === config.protocol
            ? node_https_1.default.createServer(config.custom || config.serverOptions)
            : node_http_1.default.createServer();
        server.on('request', handle_request);
        server.on('error', reply);
        server.on('listening', function () {
            config.port = server.address().port;
            reply(config);
        });
        const listener = listen();
        close(seneca, function (reply) {
            if (listener) {
                listener.close();
            }
            reply();
        });
        function listen() {
            const port = (config.port = seneca.util.resolve_option(config.port, config));
            const host = (config.host = seneca.util.resolve_option(config.host, config));
            seneca.log.debug(`transport web listen`, config);
            return server.listen(port, host);
        }
        function handle_request(req, res) {
            req.setEncoding('utf8');
            const query = node_url_1.default.parse(req.url).query || '';
            req.query = qs_1.default.parse(query);
            const buf = [];
            req.on('data', function (chunk) {
                buf.push(chunk);
            });
            req.on('end', function () {
                let msg;
                const json = buf.join('');
                const body = parseJSON(json);
                if (node_util_1.default.types.isNativeError(body)) {
                    msg = {
                        json: json,
                        role: 'seneca',
                        make: 'error',
                        code: 'parseJSON',
                        err: body,
                    };
                }
                else {
                    msg = Object.assign(body, req.query && req.query.msg$ ? Jsonic(req.query.msg$) : {}, req.query || {});
                }
                // backwards compatibility with seneca-transport
                let backwards_compat_origin;
                const backwards_compat_msgid = !msg.meta$ && req.headers['seneca-id'];
                if (backwards_compat_msgid) {
                    msg.meta$ = { id: req.headers['seneca-id'] };
                    backwards_compat_origin = req.headers['seneca-origin'];
                }
                msg = internalize_msg(seneca, msg);
                seneca.act(msg, function (err, out, meta) {
                    let spec = {
                        err: err,
                        out: out,
                        meta: meta,
                        config: config,
                    };
                    spec.headers = {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'private, max-age=0, no-cache, no-store',
                    };
                    spec.status = err ? 500 : 200;
                    spec = config.modify_response(seneca, spec);
                    // backwards compatibility with seneca-transport
                    if (backwards_compat_msgid) {
                        spec.headers['seneca-id'] = backwards_compat_msgid;
                        spec.headers['seneca-origin'] = backwards_compat_origin;
                    }
                    res.writeHead(spec.status, spec.headers);
                    res.end(spec.body);
                });
            });
        }
    }
    //function hook_client_web(config, ready) {
    function hook_client_web(msg, hook_reply) {
        const seneca = this.root.delegate();
        const transport_options = seneca.options().transport;
        const config = seneca.util.deep(msg);
        config.port = null == config.port ? transport_options.port : config.port;
        config.modify_request = config.modify_request || web_modify_request;
        (config.port = seneca.util.resolve_option(config.port, config)),
            (config.host = seneca.util.resolve_option(config.host, config));
        config.wreck = seneca.util.resolve_option(config.wreck || makeWreck, config);
        hook_reply({
            config: config,
            send: function (msg, reply, meta) {
                const sending_instance = this;
                let spec = {
                    msg: msg,
                    meta: meta,
                    url: config.protocol +
                        '://' +
                        config.host +
                        ':' +
                        config.port +
                        config.path,
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                };
                spec = config.modify_request(seneca, spec);
                const wreck_req = config.wreck.request(spec.method, spec.url, spec.wreck);
                wreck_req
                    .then(function (res) {
                    const seneca_reply = function (res) {
                        // backwards compatibility with seneca-transport
                        if (!res.meta$) {
                            res.meta$ = {
                                id: meta.id,
                            };
                        }
                        // seneca.reply(internalize_reply(sending_instance, res))
                        let replySpec = internalize_reply(sending_instance, res);
                        reply(replySpec.err, replySpec.out, replySpec.meta);
                    };
                    const wreck_read = wreck_1.default.read(res, spec.wreck.read);
                    wreck_read
                        .then(function (body) {
                        let data = parseJSON(body);
                        // JSON cannot handle arbitrary array properties
                        if (Array.isArray(data.array$)) {
                            const array_data = data.array$;
                            array_data.meta$ = data.meta$;
                            data = array_data;
                        }
                        seneca_reply(data);
                    })
                        .catch(seneca_reply);
                })
                    .catch(function (err) {
                    return reply(err);
                });
            },
        });
    }
    function web_modify_response(seneca, spec) {
        // JSON cannot handle arbitrary array properties
        if (Array.isArray(spec.out)) {
            spec.out = { array$: spec.out, meta$: spec.out.meta$ };
        }
        spec.body = stringifyJSON(externalize_reply(seneca, spec.err, spec.out, spec.meta));
        spec.headers['Content-Length'] = Buffer.byteLength(spec.body);
        return spec;
    }
    function web_modify_request(seneca, spec) {
        let extmsg = externalize_msg(seneca, spec.msg, spec.meta);
        spec.body = stringifyJSON(extmsg);
        spec.headers['Content-Length'] = Buffer.byteLength(spec.body);
        spec.wreck = {
            json: false,
            headers: spec.headers,
            payload: spec.body,
            read: {},
        };
        return spec;
    }
    function makeWreck() {
        return wreck_1.default.defaults({
            agents: {
                http: new node_http_1.default.Agent({ keepAlive: true, maxFreeSockets: Infinity }),
                https: new node_https_1.default.Agent({ keepAlive: true, maxFreeSockets: Infinity }),
                httpsAllowUnauthorized: new node_https_1.default.Agent({
                    keepAlive: true,
                    maxFreeSockets: Infinity,
                    rejectUnauthorized: false,
                }),
            },
        });
    }
    return {};
}
// Default options.
transport.defaults = {};
exports.default = transport;
if ('undefined' !== typeof (module)) {
    module.exports = transport;
}
//# sourceMappingURL=transport.js.map