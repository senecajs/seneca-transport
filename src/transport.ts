/* Copyright © 2021-2023 Richard Rodger, MIT License. */


import Util from 'node:util'
import Http from 'node:http'
import Https from 'node:https'
import Url from 'node:url'

import Qs from 'qs'
import Wreck from '@hapi/wreck'


// import Seneca from 'seneca'

// const { Open, Skip } = Seneca.valid

// TODO: replace Wreck depedency with standard node http client


// See defaults below for behaviour.
type TransportOptions = {
}


function transport(this: any, options: TransportOptions) {
  let seneca: any = this
  const root: any = seneca.root


  const Jsonic = seneca.util.Jsonic

  const {
    stringifyJSON,
    parseJSON,
    externalize_msg,
    externalize_reply,
    internalize_msg,
    internalize_reply,
    close,
    info,
  } = seneca.export('transport/utils')



  seneca.add('role:transport,hook:listen,type:web', hook_listen_web)
  seneca.add('role:transport,hook:client,type:web', hook_client_web)


  // function hook_listen_web(config, ready) {
  function hook_listen_web(this: any, msg: any, reply: any) {
    const seneca = this.root.delegate()
    const transport_options = seneca.options().transport
    const config = seneca.util.deep(msg)

    config.port = null == config.port ? transport_options.port : config.port
    config.modify_response = config.modify_response || web_modify_response

    const server =
      'https' === config.protocol
        ? Https.createServer(config.custom || config.serverOptions)
        : Http.createServer()

    server.on('request', handle_request)

    server.on('error', reply)

    server.on('listening', function() {
      config.port = (server as any).address().port
      reply(config)
    })

    const listener = listen()

    close(seneca, function(reply: any) {
      if (listener) {
        listener.close()
      }
      reply()
    })

    function listen() {
      const port = (config.port = seneca.util.resolve_option(config.port, config))
      const host = (config.host = seneca.util.resolve_option(config.host, config))

      seneca.log.debug(`transport web listen`, config)

      return server.listen(port, host)
    }

    function handle_request(req: any, res: any) {
      req.setEncoding('utf8')
      const query = Url.parse(req.url).query || ''
      req.query = Qs.parse(query)

      const buf: any = []

      req.on('data', function(chunk: any) {
        buf.push(chunk)
      })

      req.on('end', function() {
        let msg
        const json = buf.join('')
        const body = parseJSON(json)

        if (Util.types.isNativeError(body)) {
          msg = {
            json: json,
            role: 'seneca',
            make: 'error',
            code: 'parseJSON',
            err: body,
          }
        } else {
          msg = Object.assign(
            body,
            req.query && req.query.msg$ ? Jsonic(req.query.msg$) : {},
            req.query || {}
          )
        }

        // backwards compatibility with seneca-transport
        let backwards_compat_origin: any
        const backwards_compat_msgid = !msg.meta$ && req.headers['seneca-id']
        if (backwards_compat_msgid) {
          msg.meta$ = { id: req.headers['seneca-id'] }
          backwards_compat_origin = req.headers['seneca-origin']
        }

        msg = internalize_msg(seneca, msg)

        seneca.act(msg, function(err: any, out: any, meta: any) {
          let spec: any = {
            err: err,
            out: out,
            meta: meta,
            config: config,
          }

          spec.headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=0, no-cache, no-store',
          }

          spec.status = err ? 500 : 200

          spec = config.modify_response(seneca, spec)

          // backwards compatibility with seneca-transport
          if (backwards_compat_msgid) {
            spec.headers['seneca-id'] = backwards_compat_msgid
            spec.headers['seneca-origin'] = backwards_compat_origin
          }

          res.writeHead(spec.status, spec.headers)
          res.end(spec.body)
        })
      })
    }
  }


  //function hook_client_web(config, ready) {
  function hook_client_web(this: any, msg: any, hook_reply: any) {
    const seneca = this.root.delegate()
    const transport_options = seneca.options().transport
    const config = seneca.util.deep(msg)

    config.port = null == config.port ? transport_options.port : config.port

    config.modify_request = config.modify_request || web_modify_request
      ; (config.port = seneca.util.resolve_option(config.port, config)),
        (config.host = seneca.util.resolve_option(config.host, config))

    config.wreck = seneca.util.resolve_option(config.wreck || makeWreck, config)

    hook_reply({
      config: config,
      send: function(msg: any, reply: any, meta: any) {
        const sending_instance = this

        let spec: any = {
          msg: msg,
          meta: meta,
          url:
            config.protocol +
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
        }

        spec = config.modify_request(seneca, spec)
        const wreck_req = config.wreck.request(spec.method, spec.url, spec.wreck)
        wreck_req
          .then(function(res: any) {
            const seneca_reply = function(res: any) {
              // backwards compatibility with seneca-transport
              if (!res.meta$) {
                res.meta$ = {
                  id: meta.id,
                }
              }

              // seneca.reply(internalize_reply(sending_instance, res))
              let replySpec = internalize_reply(sending_instance, res)
              reply(replySpec.err, replySpec.out, replySpec.meta)
            }

            const wreck_read = Wreck.read(res, spec.wreck.read)
            wreck_read
              .then(function(body: any) {
                let data = parseJSON(body)

                // JSON cannot handle arbitrary array properties
                if (Array.isArray(data.array$)) {
                  const array_data = data.array$
                  array_data.meta$ = data.meta$
                  data = array_data
                }

                seneca_reply(data)
              })
              .catch(seneca_reply)
          })
          .catch(function(err: any) {
            return reply(err)
          })
      },
    })
  }


  function web_modify_response(seneca: any, spec: any) {
    // JSON cannot handle arbitrary array properties
    if (Array.isArray(spec.out)) {
      spec.out = { array$: spec.out, meta$: spec.out.meta$ }
    }

    spec.body = stringifyJSON(
      externalize_reply(seneca, spec.err, spec.out, spec.meta)
    )
    spec.headers['Content-Length'] = Buffer.byteLength(spec.body)

    return spec
  }


  function web_modify_request(seneca: any, spec: any) {
    let extmsg = externalize_msg(seneca, spec.msg, spec.meta)
    spec.body = stringifyJSON(extmsg)
    spec.headers['Content-Length'] = Buffer.byteLength(spec.body)

    spec.wreck = {
      json: false,
      headers: spec.headers,
      payload: spec.body,
      read: {},
    }

    return spec
  }


  function makeWreck() {
    return Wreck.defaults({
      agents: {
        http: new Http.Agent({ keepAlive: true, maxFreeSockets: Infinity }),
        https: new Https.Agent({ keepAlive: true, maxFreeSockets: Infinity }),
        httpsAllowUnauthorized: new Https.Agent({
          keepAlive: true,
          maxFreeSockets: Infinity,
          rejectUnauthorized: false,
        }),
      },
    })
  }



  return {
  }
}





// Default options.
transport.defaults = ({

} as TransportOptions)


export type {
  TransportOptions,
}

export default transport

if ('undefined' !== typeof (module)) {
  module.exports = transport
}
