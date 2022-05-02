/* Copyright © 2015-2022 Richard Rodger and other contributors, MIT License. */


const Util = require('util')
const Http = require('http')
const Https = require('https')
const Url = require('url')

const Wreck = require('@hapi/wreck')
const Qs = require('qs')


// TODO: handle lists properly, without losing meta data

function transport(options) {
  const seneca = this
  seneca.add('role:transport,hook:listen,type:web', hook_listen_web)
  seneca.add('role:transport,hook:client,type:web', hook_client_web)
}


function hook_listen_web(msg, reply) {
  const seneca = this.root.delegate()
  const Jsonic = seneca.util.Jsonic

  const tu = seneca.export('transport/utils')
  const parseJSON = tu.parseJSON
  const stringifyJSON = tu.stringifyJSON
  const internalize_msg = tu.internalize_msg
  const externalize_reply = tu.externalize_reply
  
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
    config.port = server.address().port
    reply(config)
  })

  const listener = listen()

  tu.close(seneca, function(reply) {
    if (listener) {
      listener.close()
    }
    reply()
  })

  function listen() {
    const port = (config.port = seneca.util.resolve_option(config.port, config))
    const host = (config.host = seneca.util.resolve_option(config.host, config))

    seneca.log.debug('transport web listen', config)

    return server.listen(port, host)
  }

  function handle_request(req, res) {
    req.setEncoding('utf8')
    req.query = Qs.parse(Url.parse(req.url).query)

    const buf = []

    req.on('data', function(chunk) {
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

      msg = internalize_msg(seneca, msg)
      
      seneca.act(msg, function(err, out, meta) {
        let spec = {
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

        spec = config.modify_response(seneca, externalize_reply, stringifyJSON, spec)

        res.writeHead(spec.status, spec.headers)
        res.end(spec.body)
      })
    })
  }
}

function web_modify_response(seneca, externalize_reply, stringifyJSON, spec) {
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


function hook_client_web(msg, hook_reply) {
  const seneca = this.root.delegate()
  const transport_options = seneca.options().transport
  const config = seneca.util.deep(msg)

  const tu = seneca.export('transport/utils')
  const stringifyJSON = tu.stringifyJSON
  const parseJSON = tu.parseJSON
  const externalize_msg = tu.externalize_msg
  const internalize_reply = tu.internalize_reply

  config.port = null == config.port ? transport_options.port : config.port

  config.modify_request = config.modify_request || web_modify_request
    ; (config.port = seneca.util.resolve_option(config.port, config)),
      (config.host = seneca.util.resolve_option(config.host, config))

  config.wreck = seneca.util.resolve_option(config.wreck || makeWreck, config)

  hook_reply({
    config: config,
    send: function(msg, reply, meta) {
      const sending_instance = this

      let spec = {
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

      spec = config.modify_request(seneca, externalize_msg, stringifyJSON, spec)
      
      const wreck_req = config.wreck.request(spec.method, spec.url, spec.wreck)
      wreck_req
        .then(function(res) {
          const seneca_reply = function(res) {
            const reply = internalize_reply(sending_instance, res)
            seneca.reply(reply)
          }

          const wreck_read = Wreck.read(res, spec.wreck.read)
          wreck_read
            .then(function(body) {
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
        .catch(function(err) {
          return reply(err)
        })
    },
  })
}

function web_modify_request(seneca, externalize_msg, stringifyJSON, spec) {
  spec.body = stringifyJSON(externalize_msg(seneca, spec.msg, spec.meta))
  spec.headers['Content-Length'] = Buffer.byteLength(spec.body)

  spec.wreck = {
    json: false,
    headers: spec.headers,
    payload: spec.body,
    read: {},
  }

  return spec
}


module.exports = transport
