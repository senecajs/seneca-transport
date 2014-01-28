/* Copyright (c) 2013 Richard Rodger */
"use strict";

// mocha transport.test.js


var seneca  = require('seneca')

var assert  = require('chai').assert



describe('transport', function() {
  
  it('direct', function( fin ) {

    require('seneca')()
      .add( 'c:1', function(args,done){done(null,{s:'1-'+args.d})} )
      .listen(20202)
      .ready( function(err){
        if(err) return fin(err);

        require('seneca')()
          .client(20202)
          .ready(function(err){
            if(err) return fin(err);

            this.act('c:1,d:A',function(err,out){
              if(err) return fin(err);
              
              assert.equal( '{"s":"1-A"}', JSON.stringify(out) )
              fin()
            })
          })
      })
  })
})
