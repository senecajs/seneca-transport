/* Copyright (c) 2015 Richard Rodger, MIT License */
'use strict'


var _ = require('lodash')
var Async = require('async')

var queuemap = {}


module.exports = function (options) {
  var seneca = this
  var so = seneca.options()

  options = seneca.util.deepextend(
    {
      memtest: {
        timeout: so.timeout ? so.timeout - 555 : 22222
      }
    },
    so.transport,
    options)


  var tu = seneca.export('transport/utils')

  seneca.add({role: 'transport', hook: 'listen', type: 'memtest'}, hook_listen_memtest)
  seneca.add({role: 'transport', hook: 'client', type: 'memtest'}, hook_client_memtest)


  function hook_listen_memtest (args, done) {
    var seneca = this
    var type = args.type
    var listen_options = seneca.util.clean(_.extend({}, options[type], args))

    var dest = listen_options.dest || 'common'
    queuemap[dest] = queuemap[dest] || {}

    var topics = tu.listen_topics(seneca, args, listen_options)

    topics.forEach(function (topic) {
      seneca.log.debug('listen', 'subscribe', topic + '_act', listen_options, seneca)

      queuemap[dest][topic + '_act'] = Async.queue(function (data, done) {
        tu.handle_request(seneca, data, listen_options, function (out) {
          if (null == out) {
            return done()
          }

          queuemap[dest][topic + '_res'].push(out)
          return done()
        })
      })
    })

    tu.close(seneca, function (done) {
      done()
    })

    seneca.log.info('listen', 'open', listen_options, seneca)

    done()
  }


  function hook_client_memtest (args, clientdone) {
    var seneca = this
    var type = args.type
    var client_options = seneca.util.clean(_.extend({}, options[type], args))

    var dest = client_options.dest || 'common'
    queuemap[dest] = queuemap[dest] || {}

    tu.make_client(make_send, client_options, clientdone)

    function make_send (spec, topic, send_done) {
      seneca.log.debug('client', 'subscribe', topic + '_res', client_options, seneca)

      queuemap[dest][topic + '_res'] = Async.queue(function (data, done) {
        tu.handle_response(seneca, data, client_options)
        return done()
      })

      send_done(null, function (args, done) {
        var outmsg = tu.prepare_request(seneca, args, done)

        queuemap[dest][topic + '_act'].push(outmsg)
      })
    }

    tu.close(seneca, function (done) {
      done()
    })
  }
}
