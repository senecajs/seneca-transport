/* Copyright (c) 2015 Richard Rodger, MIT License */
/* jshint node:true, asi:true, eqnull:true */
"use strict";


var util   = require('util')


var _      = require('lodash')
var nid    = require('nid')
var patrun = require('patrun')
var gex    = require('gex')
var jsonic = require('jsonic')

var error = require('eraro')({
  package:  'seneca',
  msgmap:   ERRMSGMAP(),
  override: true
})



module.exports = function( ctxt ) {
  
  var msgprefix = (null == ctxt.options.msgprefix ? '' : ctxt.options.msgprefix) 

  var tu = {

    prepare_response: function prepare_response( seneca, input ) {
      return {
        id:     input.id,
        kind:   'res',
        origin: input.origin,
        accept: seneca.id,
        track:  input.track,
        time: { 
          client_sent: (input.time && input.time.client_sent) || 0, 
          listen_recv: Date.now() 
        },
      }
    },


    handle_response: function handle_response( seneca, data, client_options ) {
      data.time = data.time || {}
      data.time.client_recv = Date.now()

      if( 'res' != data.kind ) {
        if( ctxt.options.warn.invalid_kind ) {
          seneca.log.error('client', 'invalid_kind_res', client_options, data)
        }
        return false
      }

      if( null == data.id ) {
        if( ctxt.options.warn.no_message_id ) {
          seneca.log.error('client', 'no_message_id', client_options, data);
        }
        return false;
      }

      var callmeta = ctxt.callmap.get(data.id)

      if( callmeta ) {
        ctxt.callmap.del( data.id )
      }
      else {
        if( ctxt.options.warn.unknown_message_id ) {
          seneca.log.warn('client', 'unknown_message_id', client_options, data);
        }
        return false;
      }

      var err    = null
      var result = null

      if( data.error ) {
        err = new Error( data.error.message )

        _.each(data.error,function(v,k){
          err[k] = v
        })
      }
      else {
        result = tu.handle_entity(data.res)
      }
      
      try {
        callmeta.done( err, result ) 
      }
      catch(e) {
        seneca.log.error(
          'client', 'callback_error', client_options, data, e.stack||e)
      }

      return true;
    },


    prepare_request: function prepare_request( seneca, args, done ) {
      var callmeta = {
        args: args,
        done: _.bind(done,seneca),
        when: Date.now()
      }

      ctxt.callmap.set(args.meta$.id,callmeta) 

      var track = []
      if( args.transport$ ) {
        track = _.clone((args.transport$.track||[]))
      }
      track.push(seneca.id)

      var output = {
        id:     args.meta$.id,
        kind:   'act',
        origin: seneca.id,
        track:  track,
        time:   { client_sent: Date.now() },
        act:    seneca.util.clean(args),
      }

      return output;
    },


    handle_request: function handle_request( 
      seneca, data, listen_options, respond 
    ) {
      if( null == data ) return respond({input:data,error:error('no_data')});

      if( 'act' != data.kind ) {
        if( ctxt.options.warn.invalid_kind ) {
          seneca.log.warn('listen', 'invalid_kind_act', listen_options, data)
        }
        return respond({
          input:data,
          error:error('invalid_kind_act',{kind:data.kind})
        });
      }

      if( null == data.id ) {
        if( ctxt.options.warn.no_message_id ) {
          seneca.log.warn('listen', 'no_message_id', listen_options, data)
        }
        return respond({input:data,error:error('no_message_id')});
      }

      if( ctxt.options.check.own_message && ctxt.callmap.has(data.id) ) {
        if( ctxt.options.warn.own_message ) {
          seneca.log.warn('listen', 'own_message', listen_options, data)
        }
        return respond({input:data,error:error('own_message')});
      }

      if( ctxt.options.check.message_loop &&  _.isArray(data.track) ) {
        for( var i = 0; i < data.track.length; i++ ) {
          if( seneca.id === data.track[i] ) {
            if( ctxt.options.warn.message_loop ) {
              seneca.log.warn('listen', 'message_loop', listen_options, data)
            }
            return respond({input:data,error:error('message_loop')});
          }
        }
      }

      if( data.error ) {
        seneca.log.error('listen', 'data_error', listen_options, data )
        return respond({input:data,error:error('data_error')});
      }

      var output = tu.prepare_response( seneca, data )
      var input  = tu.handle_entity( data.act )

      input.transport$ = {
        track: data.track || []
      }

      input.actid$ = data.id

      try {
        seneca.act( input, function( err, out ) {
          tu.update_output(input,output,err,out)
          
          respond(output)
        })
      }
      catch(e) {
        tu.catch_act_error( seneca, e, listen_options, data, output )
        respond(output)
      }
    },


    make_client: function make_client( 
      context_seneca, 
      make_send, 
      client_options, 
      client_done 
    ) {
      var instance = ctxt.seneca

      // legacy api
      if( !context_seneca.seneca ) {
        client_done    = client_options
        client_options = make_send
        make_send      = context_seneca
      }
      else {
        instance = context_seneca
      }

      var pins = tu.resolve_pins( client_options )
      instance.log.debug( 'client', client_options, pins||'any' )

      if( pins ) {
        var argspatrun  = tu.make_argspatrun( pins )
        var resolvesend = tu.make_resolvesend( client_options, {}, make_send )

        tu.make_pinclient( resolvesend, argspatrun, function( err, send ) {
          if( err ) return client_done(err);
          client_done( null, send )
        })
      }
      else {
        tu.make_anyclient( client_options, make_send, function( err, send ) {
          if( err ) return client_done(err);
          client_done( null, send )
        })
      }
    },


    make_anyclient: function make_anyclient( opts, make_send, done ) {
      make_send( {}, msgprefix+'any', function( err, send ) {
        if( err ) return done(err);
        if( !_.isFunction(send) ) 
          return done(ctxt.seneca.fail('null-client',{opts:opts}));

        var client = {
          id:       nid(),
          toString: function(){ return 'any-'+this.id },

          // TODO: is this used?
          match: function( args ) { 
            return !this.has(args)
          },

          send: function( args, done ) {
            send.call(this,args,done)
          }
        }

        done( null, client )
      })
    },


    make_pinclient: function make_pinclient( resolvesend, argspatrun, done ) {  
      var client = {
        id:       nid(),
        toString: function(){ return 'pin-'+argspatrun.mark+'-'+this.id },

        // TODO: is this used?
        match: function( args ) {
          var match = !!argspatrun.find(args)
          return match
        },

        send: function( args, done ) {
          var seneca = this
          var spec = argspatrun.find(args)
          resolvesend(spec,args,function(err, send){
            if( err ) return done(err);
            send.call(seneca,args,done)
          })
        }
      }

      done( null, client )
    },


    resolve_pins: function resolve_pins( opts ) {
      var pins = opts.pin || opts.pins
      if( pins ) {
        pins = _.isArray(pins) ? pins : [pins]
      }

      if( pins ) {
        pins = _.map(pins,function(pin){
          return _.isString(pin) ? jsonic(pin) : pin
        })
      }

      return pins
    },


    // can handle glob expressions :)
    make_argspatrun: function make_argspatrun( pins ) {
      var argspatrun = patrun(function(pat,data) {
        var gexers = {}
        _.each(pat, function(v,k) {
          if( _.isString(v) && ~v.indexOf('*') ) {
            delete pat[k]
            gexers[k] = gex(v)
          }
        })

        // handle previous patterns that match this pattern
        var prev = this.list(pat)
        var prevfind = prev[0] && prev[0].find
        var prevdata = prev[0] && this.findexact(prev[0].match)

        return function(args,data) {
          var out = data
          _.each(gexers,function(g,k) {
            var v = null==args[k]?'':args[k]
            if( null == g.on( v ) ) { out = null }
          })

          if( prevfind && null == out ) {
            out = prevfind.call(this,args,prevdata)
          }

          return out
        }
      })

      _.each( pins, function( pin ) {
        var spec = { pin:pin }
        argspatrun.add(pin,spec)
      })

      argspatrun.mark = util.inspect(pins).replace(/\s+/g, '').replace(/\n/g, '')

      return argspatrun
    },


    make_resolvesend: function make_resolvesend( opts, sendmap, make_send ) {
      return function( spec, args, done ) {
        var topic = tu.resolve_topic(opts,spec,args)
        var send  = sendmap[topic]
        if( send ) return done(null,send);

        make_send(spec,topic,function(err,send){
          if( err ) return done(err)
          sendmap[topic] = send
          done(null,send)
        })
      }
    },


    resolve_topic: function resolve_topic( opts, spec, args ) {
      if( !spec.pin ) return function() { return msgprefix+'any' }

      var topicpin = _.clone(spec.pin)

      var topicargs = {}
      _.each(topicpin, function(v,k) { topicargs[k]=args[k] })

      var sb = []
      _.each( _.keys(topicargs).sort(), function(k){
        sb.push(k)
        sb.push('=')
        sb.push(topicargs[k])
        sb.push(',')
      })

      var topic = msgprefix+(sb.join('')).replace(/[^\w\d]+/g,'_')
      return topic;
    },


    listen_topics: function listen_topics( seneca, args, listen_options, do_topic ) {
      var topics = []

      var pins = tu.resolve_pins( args )

      if( pins ) {
        _.each( ctxt.seneca.findpins( pins ), function(pin) {

          var sb = []
          _.each( _.keys(pin).sort(), function(k){
            sb.push(k)
            sb.push('=')
            sb.push(pin[k])
            sb.push(',')
          })

          var topic = msgprefix+(sb.join('')).replace(/[^\w\d]+/g,'_')


          topics.push(topic)
        })

        // TODO: die if no pins!!!
        // otherwise no listener established and seneca ends without msg
      }
      else {
        topics.push( msgprefix+'any' )
      }

      if( _.isFunction( do_topic ) ) {
        topics.forEach( function(topic){
          do_topic( topic )
        })
      }

      return topics;
    },


    update_output: function update_output( input, output, err, out ) {
      output.res = out

      if( err ) {
        var errobj     = _.extend({},err)
        errobj.message = err.message
        errobj.name    = err.name || 'Error'

        output.error = errobj
        output.input = input
      }

      output.time.listen_sent = Date.now()
    },


    catch_act_error: function catch_act_error( 
      seneca, e, listen_options, input, output 
    ) {
      seneca.log.error('listen', 'act-error', listen_options, e.stack || e )
      output.error = e
      output.input = input
    },


    // only support first level
    // interim measure - deal with this in core seneca act api
    // allow user to specify operations on result
    handle_entity: function handle_entity( raw ) {
      if( null == raw ) return raw;

      raw = _.isObject( raw ) ? raw : {}
      
      if( raw.entity$ ) {
        return ctxt.seneca.make$( raw )
      }
      else {
        _.each( raw, function(v,k) {
          if( _.isObject(v) && v.entity$ ) {
            raw[k] = ctxt.seneca.make$( v )
          }
        })
        return raw
      }
    },


    close: function close( seneca, closer ) {
      seneca.add('role:seneca,cmd:close',function( close_args, done ) {
        var seneca = this

        closer.call( seneca, function( err ) {
          if( err ) seneca.log.error(err);

          seneca.prior(close_args,done)
        })
      })
    },


    parseJSON: function parseJSON( seneca, note, str ) {
      if( str ) {
        try {
          return JSON.parse( str )
        }
        catch( e ) {
          seneca.log.warn( 'json-parse', note, str.replace(/[\r\n\t]+/g,''), e.message )
          e.input = str
          return e;
        }
      }
    },


    stringifyJSON: function stringifyJSON( seneca, note, obj ) {
      if( obj ) {
        try {
          return JSON.stringify( obj )
        }
        catch( e ) {
          seneca.log.warn( 'json-stringify', note, obj, e.message )
        }
      }
    },

  }


  // legacy names
  tu.resolvetopic = tu.resolve_topic

  return tu;
}


// Error code messages.
function ERRMSGMAP() {
  return {
    'no_data':'The message has no data.',
    'invalid_kind_act':'Inbound messages should have kind "act", kind was: <%=kind%>.',
    'no_message_id':'The message has no identifier.',
    'unknown_message_id':'The message has an unknown identifier',
    'own_message':'Inbound message rejected as originated from this server.',
    'message_loop':'Inbound message rejected as looping back to this server.',
    'data_error':'Inbound message included an error description.',
  }
}
