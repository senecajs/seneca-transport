/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var buffer  = require('buffer')

var _       = require('underscore')
var async   = require('async')
var connect = require('connect')

var nid = require('nid')


module.exports = function( options ) {
  var seneca = this
  var plugin = 'transport'



  options = seneca.util.deepextend({
  },options)
  




  seneca.add({role:plugin,cmd:'listen'}, cmd_listen)


  
  function cmd_listen( args, done ) {
    var seneca = this

    var config = seneca.util.deepextend({
      host: 'localhost',
      port: 10101,
      path: '/act',
      limit: '11mb',
      timeout: '22222'
    },args.config||{})

    var app = connect()
    app.use( connect.limit( config.limit ) )
    app.use( connect.timeout( config.timeout ) )
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
      if( 0 !== req.url.indexOf(config.path) ) return next();

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

    seneca.log.info('listen', config.host, config.port, config.path, seneca.toString())
    var listen = app.listen( config.port, config.host )

    done(null,{listen:listen})
  }



  /*
  seneca.add({init:plugin}, function( args, done ){
    done()
  })
   */

  return {
    name: plugin
  }
}
