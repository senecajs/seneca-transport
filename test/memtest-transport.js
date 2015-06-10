/* Copyright (c) 2015 Richard Rodger, MIT License */
"use strict";


var _     = require('lodash')
var async = require('async')


var queuemap = {}

module.exports = function( options ) {
  var seneca = this
  var plugin = 'memtest-transport'

  var so = seneca.options()

  options = seneca.util.deepextend(
    {
      memtest: {
        timeout:  so.timeout ? so.timeout-555 :  22222,
      },
    },
    so.transport,
    options)


  var tu = seneca.export('transport/utils')

  seneca.add({role:'transport',hook:'listen',type:'memtest'}, hook_listen_memtest)
  seneca.add({role:'transport',hook:'client',type:'memtest'}, hook_client_memtest)


  function hook_listen_memtest( args, done ) {
    var seneca         = this
    var type           = args.type
    var listen_options = seneca.util.clean(_.extend({},options[type],args))

    tu.listen_topics( seneca, args, listen_options, function(topic) {
      seneca.log.debug('listen', 'subscribe', topic+'_act', 
                       listen_options, seneca)

      queuemap[topic+'_act'] = async.queue(function(data,done){

        tu.handle_request( seneca, data, listen_options, function(out) {
          if( null == out ) return done();

          queuemap[topic+'_res'].push(out)
          return done();
        })
      })
    })

    seneca.add('role:seneca,cmd:close',function( close_args, done ) {
      var closer = this
      closer.prior(close_args,done)
    })

    seneca.log.info('listen', 'open', listen_options, seneca)

    done()
  }


  function hook_client_memtest( args, clientdone ) {
    var seneca         = this
    var type           = args.type
    var client_options = seneca.util.clean(_.extend({},options[type],args))

    tu.make_client( make_send, client_options, clientdone )

    function make_send( spec, topic, send_done ) {
      seneca.log.debug('client', 'subscribe', topic+'_res', client_options, seneca)

      queuemap[topic+'_res'] = async.queue(function(data,done){
        tu.handle_response( seneca, data, client_options )
        return done();
      })

      send_done( null, function( args, done ) {
        var outmsg = tu.prepare_request( seneca, args, done )

        queuemap[topic+'_act'].push(outmsg)
      })
    }

    seneca.add('role:seneca,cmd:close',function( close_args, done ) {
      var closer = this
      closer.prior(close_args,done)
    })
  }
}


