/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var buffer  = require('buffer')

var _       = require('underscore')
var async   = require('async')
var connect = require('connect')
var request = require('request')

var nid = require('nid')


module.exports = function( options ) {
  var seneca = this
  var plugin = 'transport'
  

  options.listen = parseConfig(options.listen,{
    type:   'http',
    host:   'localhost',
    port:   10101,
    path:   '/act',
    limit:  '11mb',
    timeout: 22222
  })

  options.client = parseConfig(options.client,{
    type:   'http',
    host:   'localhost',
    port:   10101,
    path:   '/act',
    limit:  '11mb',
    timeout: 22222
  })


  options = seneca.util.deepextend({
  },options)
  




  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)
  seneca.add({role:plugin,cmd:'client'}, cmd_client)

  seneca.add({role:plugin,hook:'listen',type:'http'}, hook_listen_http)
  seneca.add({role:plugin,hook:'client',type:'http'}, hook_client_http)




  function parseConfig( inargs, base ) {
    if( null == inargs ) return base;
    if( _.isObject(inargs) && !_.isArray(inargs) ) return inargs;

    var arglen = inargs.length

    var config = {}

    // TODO: clean this up!
    if( 0 === arglen ) {
      config.port = base.port
      config.host = base.host
      config.path = base.path
    }
    else if( 1 === arglen ) {
      if( _.isObject( inargs[0] ) ) {
        config = inargs[0]
      }
      else {
        config.port = parseInt(inargs[0])
        config.host = base.host
        config.path = base.path
      }
    }
    else if( 2 === arglen ) {
      config.port = parseInt(inargs[0])
      config.host = inargs[1]
      config.path = base.path
    }
    else if( 3 === arglen ) {
      config.port = parseInt(inargs[0])
      config.host = inargs[1]
      config.path = inargs[2]
    }

    config.port = null == config.port ? base.port : config.port 
    config.host = null == config.host ? base.host : config.host
    config.path = null == config.path ? base.path : config.path

    config.type = null == config.type ? base.type : config.type

    return config
  }


  
  function cmd_listen( args, done ) {
    var seneca = this

    var listen_config = parseConfig(args.listen,options.listen)
    seneca.act( _.extend({role:plugin,hook:'listen'},options.listen,listen_config),done)
  }


  function cmd_client( args, done ) {
    var seneca = this

    var client_config  = parseConfig(args.client,options.client)
    var client_args = _.extend({role:plugin,hook:'client'},options.client,client_config)

    seneca.act( client_args, done )
  }



  function hook_listen_http( args, done ) {
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



  function hook_client_http( args, done ) {
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

    seneca.log.info('client', args.host, args.port, args.path, fullurl)

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
