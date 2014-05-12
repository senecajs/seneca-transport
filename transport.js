/* Copyright (c) 2013-2014 Richard Rodger, MIT License */
"use strict";


var buffer = require('buffer')
var util   = require('util')

var _           = require('underscore')
var patrun      = require('patrun')
var gex         = require('gex')
var connect     = require('connect')
var request     = require('request')
var redis       = require('redis')
var fivebeans   = require('fivebeans')


var nid = require('nid')




module.exports = function( options ) {
  var seneca = this
  var plugin = 'transport'
  

  options = seneca.util.deepextend({
    msgprefix:'seneca_',
    direct: {
      type:   'direct',
      host:   'localhost',
      port:   10101,
      path:   '/act',
      limit:  '11mb',
      timeout: 22222
    },
    pubsub: {
      type:  'pubsub',
      port:  6379,
      host:  'localhost'
    },
    queue: {
      alivetime: 111,
      port:  11300,
      host:  'localhost'
    }
  },options)
  




  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)
  seneca.add({role:plugin,cmd:'client'}, cmd_client)

  seneca.add({role:plugin,hook:'listen',type:'direct'}, hook_listen_direct)
  seneca.add({role:plugin,hook:'client',type:'direct'}, hook_client_direct)

  seneca.add({role:plugin,hook:'listen',type:'pubsub'}, hook_listen_pubsub)
  seneca.add({role:plugin,hook:'client',type:'pubsub'}, hook_client_pubsub)

  seneca.add({role:plugin,hook:'listen',type:'queue'}, hook_listen_queue)
  seneca.add({role:plugin,hook:'client',type:'queue'}, hook_client_queue)






  
  function cmd_listen( args, done ) {
    var seneca = this

    var listen_config = parseConfig(args)
    var listen_args = _.omit(_.extend({},options[listen_config.type],listen_config,{role:plugin,hook:'listen'}),'cmd') 

    seneca.act( listen_args,done)
  }


  function cmd_client( args, done ) {
    var seneca = this

    var client_config  = parseConfig(args)
    var client_args = _.omit(_.extend({},options[client_config.type],client_config,{role:plugin,hook:'client'}),'cmd')

    seneca.act( client_args, done )
  }



  function hook_listen_direct( args, done ) {
    var seneca = this

    var app = connect()
    //app.use( connect.limit( args.limit ) )
    app.use( connect.timeout( args.timeout ) )
    app.use( connect.responseTime() )

    // query params get injected into args
    // let's you use a GET for debug
    // GETs can have side-effects, this is not a web server, or a REST API
    app.use( connect.query() )


    app.use( function( req, res, next ){
      var buf = ''
      req.setEncoding('utf8')
      req.on('data', function(chunk){ buf += chunk })
      req.on('end', function(){
        try {
          req.body = _.extend(0<buf.length?JSON.parse(buf):{},req.query||{})

          next();
        } 
        catch (err){
          err.body = buf
          err.status = 400
          next(err)
        }
      })
    })

    
    function handle_error(e,res) {
      if( e.seneca ) {
        e.seneca.message = e.message
        var outjson = JSON.stringify(e.seneca)
        res.writeHead(400,{
          'Content-Type':   'application/json',
          'Cache-Control':  'private, max-age=0, no-cache, no-store',
          'Content-Length': buffer.Buffer.byteLength(outjson) 
        })
        res.end( outjson )
      } 
      else {
        res.writeHead(500)
        res.end( e.message )
      }
    }

    app.use( function( req, res, next ){
      if( 0 !== req.url.indexOf(args.path) ) return next();

      try {
        var input = handle_entity( req.body )
        seneca.act( input, function( err, out ){
          if( err ) return handle_error(err,res);
          
          var outjson = _.isUndefined(out) ? '{}' : JSON.stringify(out)

          res.writeHead(200,{
            'Content-Type':   'application/json',
            'Cache-Control':  'private, max-age=0, no-cache, no-store',
            'Content-Length': buffer.Buffer.byteLength(outjson) 
          })
          res.end( outjson )
        })
      }
      catch(e) {
        handle_error(err,res);
      }
    })

    seneca.log.info('listen', args.host, args.port, args.path, seneca.toString())
    var listen = app.listen( args.port, args.host )

    done(null,listen)
  }



  function hook_client_direct( args, clientdone ) {
    var seneca = this

    var fullurl = 'http://'+args.host+':'+args.port+args.path

    var client = make_anyclient(make_send({},'any'))

    var pins = resolve_pins(args)
    if( pins ) {
      var argspatrun = make_argspatrun(pins)

      var sendmap = {}
      var resolvesend  = make_resolvesend(sendmap,make_send)

      client = make_pinclient( resolvesend, argspatrun )
    }

    seneca.log.info('client', 'direct', args.host, args.port, args.path, fullurl, pins||'any', seneca.toString())
    clientdone(null,client)



    function make_send( spec, topic ) {
      seneca.log.debug('client', 'direct', 'send', spec, topic, args.host, args.port, args.path, fullurl, seneca.toString())
      
      return function( args, done ) {
        var reqopts = {
          url:fullurl,
          json:args
        }
        request.post( reqopts, function(err,response) {
          // TODO: need more info for this err
          if(err) return done(err);

          if( 200 != response.statusCode ) {
            var errdesc = response.body
            var localerr = new Error(errdesc.message)
            localerr.seneca = errdesc
            done(localerr)
          }
          else {
            var out = handle_entity( response.body )
            done(null, out)
          }
        })
      }
    }
  }  



  function hook_listen_pubsub( args, done ) {
    var seneca = this

    var redis_in  = redis.createClient(args.port,args.host)
    var redis_out = redis.createClient(args.port,args.host)

    redis_in.on('message',function(channel,msgstr){
      var data = JSON.parse(msgstr)

      if( 'act' == data.kind ) {
        seneca.act(data.act,function(err,res){
          var outmsg = {
            kind:'res',
            id:data.id,
            err:err?err.message:null,
            res:res
          }
          var outstr = JSON.stringify(outmsg)
          redis_out.publish(channel,outstr)
        })
      }
    })

    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each( seneca.findpins( pins ), function(pin){
        var pinstr = options.msgprefix+util.inspect(pin)
        redis_in.subscribe(pinstr)
      })
    }

    redis_in.subscribe(options.msgprefix+'all')
    
    seneca.log.info('listen', args.host, args.port, seneca.toString())
    done()
  }



  function hook_client_pubsub( args, done ) {
    var seneca = this

    var redis_in  = redis.createClient(args.port,args.host)
    var redis_out = redis.createClient(args.port,args.host)

    var callmap = {}

    redis_in.on('message',function(channel,msgstr){
      var data = JSON.parse(msgstr)

      if( 'res' == data.kind ) {
        var call = callmap[data.id]
        if( call ) {
          delete callmap[data.id]

          call.done( data.err ? new Error(data.err) : null, data.res )
        }
      }
    })

    var client = function( args, done ) {
      var outmsg = {
        id:   nid(),
        kind: 'act',
        act:  args
      }
      var outstr = JSON.stringify(outmsg)
      callmap[outmsg.id] = {done:done}

      var actmeta = seneca.findact(args)
      if( actmeta ) {
        var actstr = options.msgprefix+util.inspect(actmeta.args)
        redis_out.publish(actstr,outstr)
      }
      else {
        redis_out.publish(options.msgprefix+'all',outstr)
      }
    }


    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each( seneca.findpins( pins ), function(pin){
        var pinstr = options.msgprefix+util.inspect(pin)
        seneca.add(pin,client)
        redis_in.subscribe(pinstr)    
      })
    }

    redis_in.subscribe(options.msgprefix+'all')    

    seneca.log.info('client', 'pubsub', args.host, args.port, seneca.toString())

    done(null,client)
  }




  function hook_listen_queue( args, done ) {
    var seneca = this


    function do_listen(mark) {
      var send = new fivebeans.client(args.host,args.port);
      send
        .on('connect', function() {
          var topic_out = options.msgprefix+'_'+mark+'_out'
          send.use(topic_out, function(err, numwatched) {
            if( err ) return seneca.log.error(err);
          })
        })
        .on('error', function(err) { seneca.log.error('LISTEN send error '+err) })
        .on('close', function() { seneca.log.info('LISTEN send close') })
        .connect()

      var recv = new fivebeans.client(args.host,args.port);
      recv
        .on('connect', function() {
          var topic_in = options.msgprefix+'_'+mark+'_in'
          recv.watch(topic_in, function(err, numwatched) {
            if( err ) return seneca.log.error(err);

            function do_reserve() {
              recv.reserve(function(err, jobid, payload) {
                if( err ) return console.log(err);

                try {
                  var data = JSON.parse(payload)
                }
                catch( je ) {
                  return process.nextTick(do_reserve)
                }
                
                if( 'act' == data.kind ) {
                  seneca.act(data.act,function(err,res){
                    var outmsg = {
                      kind:'res',
                      id:data.id,
                      err:err?err.message:null,
                      res:res
                    }
                    var outstr = JSON.stringify(outmsg)

                    send.put(100,0,args.alivetime,outstr, function(err,outjobid){
                      if( err ) return seneca.log.error(err);

                      recv.destroy(jobid, function(err) {
                        if( err ) return seneca.log.error(err);

                        process.nextTick(do_reserve)
                      });
                    })
                  })
                }
              })
            }
            do_reserve()

          })
        })
        .on('error', function(err) { seneca.log.error(err+' LISTEN recv error') })
        .on('close', function() { seneca.log.info('LISTEN recv close') })
        .connect()
    }

    
    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each( seneca.findpins( pins ), function(pin){
        var pinmark = util.inspect(pin).replace(/=/,'__').replace(/[^\w\d]/g,'_')
        do_listen(pinmark)
      })
    }
    else do_listen('any')


    seneca.log.info('listen', 'queue', args.host, args.port, seneca.toString())
    done()
  }



  function hook_client_queue( args, done ) {
    var seneca  = this


    function do_client( mark, register ) {
      var seenmap = {}
      var callmap = {}
      var recv    = new fivebeans.client(args.host,args.port);

      function do_connect() {
        var topic_recv = options.msgprefix+'_'+mark+'_out'
        recv.watch(topic_recv, function(err, numwatched) {
          if( err ) return seneca.log.error(err);

          function do_reserve() {
            recv.reserve(function(err, jobid, payload) {
              if( err ) return seneca.log.error(err);

              try {
                var data = JSON.parse(payload)
              }
              catch( je ) {
                seneca.log.error(je)
                return process.nextTick( do_reserve )
              }

              if( 'res' == data.kind ) {
                var call = callmap[data.id]

                if( call ) {
                  delete callmap[data.id]

                  recv.destroy(jobid, function(err) {
                    if( err ) return seneca.log.error(err);

                    process.nextTick( do_reserve )
                  })

                  call.done( data.err ? new Error(data.err) : null, data.res )
                }
                else {
                  // FIX: memleak!
                  if( seenmap[jobid] ) {
                    setTimeout( function(){do_release(jobid)}, 111 )
                  }
                  else {
                    seenmap[jobid]=new Date().getTime()
                    do_release(jobid)
                  }
                }
              }
              else {
                recv.release(jobid,100,0,function(err) {
                  if( err ) return seneca.log.error(err);
                })
              }

              function do_release(jobid) {
                recv.release(jobid,100,0,function(err) {
                  if( err ) return seneca.log.error(err);
                  process.nextTick( do_reserve )
                })
              }
            })
          }
          do_reserve()
        })
      }

      recv
        .on('connect', do_connect)
        .on('error', function(err) { seneca.log.error('CLIENT recv error '+err) })
        .on('close', function() { seneca.log.info('CLIENT recv close') })
        .connect()


      function do_send() {
        var send = new fivebeans.client(args.host,args.port);

        send
          .on('connect', function() {
            var topic_send = options.msgprefix+'_'+mark+'_in'
            send.use(topic_send, function(err, numwatched) {
              if( err ) return seneca.log.error(err);

              var outclient = function( args, done ) {
                var outmsg = {
                  id:   nid(),
                  kind: 'act',
                  act:  seneca.util.clean(args)
                }
                var outstr = JSON.stringify(outmsg)
                callmap[outmsg.id] = {done:done}

                send.put(100,0,111,outstr, function(err,outjobid){
                  if( err ) return seneca.log.error(err);
                })
              }

              seneca.log.info('client', 'queue', args.host, args.port, seneca.toString())
              register(null,outclient)
            })
          })
          .on('error', function(err) {
          })
          .on('close', function() {
          })
          .connect()
      }
      do_send()

    }


    var pins_todo = {}

    var clientpatrun = patrun()
    function clientrouter( args, done ) {
      var client_call = clientpatrun.find(args)
      if( client_call ) {
        client_call( args, done ) 
      }
      else {
        client_call = clientpatrun.find({any:true})
        if( client_call ) {
          client_call( args, done ) 
        }
        else {
          seneca.log.error({code:'args-not-found',args:args})
        }
      }
    }


    function make_register(pin) {
      return function(err,client_call) {
        delete pins_todo[util.inspect(pin)]

        if( err ) return seneca.log.error(err);
        clientpatrun.add(pin,client_call)

        if( 0 == _.keys(pins_todo).length ) {
          done( null, clientrouter )
        }
      }
    }

    // TODO: support args.pins
    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each( seneca.findpins( pins ), function(pin){
        var pinmark = util.inspect(pin).replace(/=/,'__').replace(/[^\w\d]/g,'_')
        pins_todo[util.inspect(pin)]=true
        do_client(pinmark,make_register(pin))
        seneca.add(pin,clientrouter)
      })
    }
    else {
      do_client('any',make_register({any:true}))
    }
  }




  function parseConfig( args ) {
    var out = {}

    var config = args.config || args
    var base = options.direct

    if( _.isArray( config ) ) {
      var arglen = config.length

      if( 0 === arglen ) {
        out.port = base.port
        out.host = base.host
        out.path = base.path
      }
      else if( 1 === arglen ) {
        if( _.isObject( config[0] ) ) {
          out = config[0]
        }
        else {
          out.port = parseInt(config[0])
          out.host = base.host
          out.path = base.path
        }
      }
      else if( 2 === arglen ) {
        out.port = parseInt(config[0])
        out.host = config[1]
        out.path = base.path
      }
      else if( 3 === arglen ) {
        out.port = parseInt(config[0])
        out.host = config[1]
        out.path = config[2]
      }

    }
    else out = config;

    out.type = null == out.type ? base.type : out.type

    if( 'direct' == out.type ) {
      out.port = null == out.port ? base.port : out.port 
      out.host = null == out.host ? base.host : out.host
      out.path = null == out.path ? base.path : out.path
    }

    return out
  }


  // only support first level
  // interim measure - deal with this in core seneca act api
  // allow user to specify operations on result
  function handle_entity( raw ) {
    raw = _.isObject( raw ) ? raw : {}
    
    if( raw.entity$ ) {
      return seneca.make$( raw )
    }
    else {
      _.each( raw, function(v,k){
        if( _.isObject(v) && v.entity$ ) {
          raw[k] = seneca.make$( v )
        }
      })
      return raw
    }
  }



  function resolve_pins( args ) {
    var pins = args.pin || args.pins
    if( pins ) {
      pins = _.isArray(pins) ? pins : [pins]
    }
    return pins
  }



  // can handle glob expressions :)
  function make_argspatrun( pins ) {
    var argspatrun = patrun(function(pat,data){
      var gexers = {}
      _.each(pat, function(v,k){
        if( _.isString(v) && ~v.indexOf('*') ) {
          delete pat[k]
          gexers[k] = gex(v)
        }
      })

      // handle previous patterns that match this pattern
      var prev = this.list(pat)
      var prevfind = prev[0] && prev[0].find
      var prevdata = prev[0] && this.findexact(prev[0].match)

      return function(args,data){
        var out = data
        _.each(gexers,function(g,k){
          var v = null==args[k]?'':args[k]
          if( null == g.on( v ) ) { out = null }
        })

        if( prevfind && null == out ) {
          out = prevfind.call(this,args,prevdata)
        }

        return out
      }
    })

    _.each( pins, function( pin ){
      var spec = { pin:pin }
      argspatrun.add(pin,spec)
    })

    return argspatrun
  }



  function resolvetopic( spec, args ) {
    if( !spec.pin ) return function() { return 'any' }

    var topicpin = _.clone(spec.pin)

    var topicargs = {}
    _.each(topicpin, function(v,k){ topicargs[k]=args[k] })

    return util.inspect(topicargs)
    //.replace(/=/,'__')
      .replace(/[^\w\d]/g,'_')
  }


  function make_resolvesend( sendmap, make_send ) {
    return function( spec, args ) {
      var topic = resolvetopic(spec,args)
      var send = sendmap[topic]
      if( send ) return send;

      return sendmap[topic] = make_send(spec,topic)
    }
  }



  function make_anyclient( send ) {
    return {
      match: function( args ) { 
        return !this.has(args)
      },
      send: function( args, done ) {
        send(args,done)
      },
    }
  }


  function make_pinclient( resolvesend, argspatrun ) {  
    return {
      match: function( args ) {
        var match = !!argspatrun.find(args)
        return match
      },
      send: function( args, done ) {
        var spec = argspatrun.find(args)
        var send = resolvesend(spec,args)
        send(args,done)
      }
    }
  }

  return {
    name: plugin,
  }
}
