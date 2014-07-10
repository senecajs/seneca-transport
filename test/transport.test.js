/* Copyright (c) 2013-2014 Richard Rodger */
"use strict";


// mocha transport.test.js


var seneca  = require('seneca')

var assert  = require('assert')

var test = require('seneca-transport-test')



function run_client( type, port, done ) {
  require('seneca')({log:'silent'})
    .client({type:type,port:port})
    .ready( function() {

      this.act('c:1,d:A',function(err,out){
        if(err) return fin(err);
              
        assert.equal( '{"s":"1-A"}', JSON.stringify(out) )

        this.act('c:1,d:AA',function(err,out){
          if(err) return fin(err);
              
          assert.equal( '{"s":"1-AA"}', JSON.stringify(out) )
          done()
        })
      })
    })
}


describe('transport', function() {

  it('happy-tcp', function( fin ) {
    test.foo_test( 'transport', require, fin, 'tcp' )
  })

  it('happy-pin-tcp', function( fin ) {
    test.foo_pintest( 'transport', require, fin, 'tcp' )
  })

  it('happy-web', function( fin ) {
    test.foo_test( 'transport', require, fin, 'web' )
  })

  it('happy-pin-web', function( fin ) {
    test.foo_pintest( 'transport', require, fin, 'web' )
  })

  
  it('tcp-basic', function( fin ) {

    require('seneca')({log:'silent'})
      .add( 'c:1', function(args,done){done(null,{s:'1-'+args.d})} )
      .listen({type:'tcp',port:20102})
      .ready( function() {

        var count = 0
        function check() {
          count++
          if( 3 == count ) fin()
        }

        run_client( 'tcp', 20102, check )
        run_client( 'tcp', 20102, check )
        run_client( 'tcp', 20102, check )
      })
  })


  it('web-basic', function( fin ) {

    require('seneca')({log:'silent'})
      .add( 'c:1', function(args,done){done(null,{s:'1-'+args.d})} )
      .listen({type:'web',port:20202})
      .ready( function() {

        var count = 0
        function check() {
          count++
          if( 3 == count ) fin()
        }

        run_client( 'web', 20202, check )
        run_client( 'web', 20202, check )
        run_client( 'web', 20202, check )
      })
  })
})
