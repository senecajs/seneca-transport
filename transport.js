/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var buffer  = require('buffer')

var _       = require('underscore')
var async   = require('async')
var connect = require('connect')
var request = require('request')
var redis   = require('redis')

var nid = require('nid')


module.exports = function( options ) {
  var seneca = this
  var plugin = 'transport'
  

  options = seneca.util.deepextend({
    direct: {
      type:   'direct',
      host:   'localhost',
      port:   10101,
      path:   '/act',
      limit:  '11mb',
      timeout: 22222
    },
    queue: {
      type:  'queue',
      port:  6379,
      host:  '127.0.0.1'
    }
  },options)
  




  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)
  seneca.add({role:plugin,cmd:'client'}, cmd_client)

  seneca.add({role:plugin,hook:'listen',type:'direct'}, hook_listen_direct)
  seneca.add({role:plugin,hook:'client',type:'direct'}, hook_client_direct)

  seneca.add({role:plugin,hook:'listen',type:'queue'}, hook_listen_queue)
  seneca.add({role:plugin,hook:'client',type:'queue'}, hook_client_queue)




  function parseConfig( args ) {
    var out = {}

    var config = args.config || args
    //console.dir(config)

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


  
  function cmd_listen( args, done ) {
    var seneca = this

    var listen_config = parseConfig(args)
    var listen_args = _.omit(_.extend({},options[listen_config.type],args,listen_config,{role:plugin,hook:'listen'}),'cmd') 

    seneca.act( listen_args,done)
  }


  function cmd_client( args, done ) {
    var seneca = this

    var client_config  = parseConfig(args)
    //console.dir(client_config)

    var client_args = _.omit(_.extend({},options[client_config.type],args,client_config,{role:plugin,hook:'client'}),'cmd')
    //console.dir(client_args)

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
        } catch (err){
          err.body = buf
          err.status = 400
          next(err)
        }
      })
    })

    
    app.use( function( req, res, next ){
      if( 0 !== req.url.indexOf(args.path) ) return next();

      seneca.act( req.body, function( err, out ){
        if( err ) return next(err);
        
        var outjson = _.isUndefined(out) ? '{}' : JSON.stringify(out)

        res.writeHead(200,{
          'Content-Type':   'application/json',
          'Cache-Control':  'private, max-age=0, no-cache, no-store',
          'Content-Length': buffer.Buffer.byteLength(outjson) 
        })
        res.end( outjson )
      })
    })

    seneca.log.info('listen', args.host, args.port, args.path, seneca.toString())
    var listen = app.listen( args.port, args.host )

    done(null,listen)
  }



  function hook_client_direct( args, done ) {
    var seneca = this

    var fullurl = 'http://'+args.host+':'+args.port+args.path

    var client = function( args, done ) {
      var reqopts = {
        url:fullurl,
        json:args
      }
      request.post(reqopts,function(err,response){
        done(err, response&&response.body)
      })
    }


    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each(pins,function(pin){
        seneca.add(pin,client)
      })
    }

    seneca.log.info('client', 'direct', args.host, args.port, args.path, fullurl, seneca.toString())

    done(null,client)
  }  


  


  function hook_listen_queue( args, done ) {
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

    redis_in.subscribe('*')

    seneca.log.info('listen', args.host, args.port, seneca.toString())
    done()
  }


  function hook_client_queue( args, done ) {
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
      redis_out.publish('*',outstr)
    }


    if( args.pin ) {
      var pins = _.isArray(args.pin) ? args.pin : [args.pin]
      _.each(pins,function(pin){
        seneca.add(pin,client)
      })
    }

    redis_in.subscribe('*')    

    seneca.log.info('client', 'queue', args.host, args.port, seneca.toString())

    done(null,client)
  }


  /*
  seneca.add({init:plugin}, function( args, done ){
    done()
  })
   */

  return {
    name: plugin,
  }
}
