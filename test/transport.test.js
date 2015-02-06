/* Copyright (c) 2013-2014 Richard Rodger */
"use strict";


// mocha transport.test.js


var seneca  = require('seneca')

var assert = require('assert')

var needle = require('needle')
var test   = require('seneca-transport-test')


process.setMaxListeners(999)


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

    require('seneca')({log:'silent',errhandler:fin})
      .use('../transport.js')
      .add( 'c:1', function(args,done){done(null,{s:'1-'+args.d})} )
      .listen({type:'web',port:20202})
      .ready( function() {

        var count = 0
        function check() {
          count++
          if( 4 == count ) fin()
        }

        run_client( 'web', 20202, check )
        run_client( 'web', 20202, check )
        run_client( 'web', 20202, check )

        // special case for non-seneca clients
        needle.post( 
          'http://localhost:20202/act',
          {c:1,d:'A'},{json:true},
          function(err,res,body){
            if( err ) return fin(err)
            assert.equal( '{"s":"1-A"}', JSON.stringify(body) )
            check()
          })
      })
  })


  it('error-passing-http', function(fin){

    require('seneca')({log:'silent'})
      .use('../transport.js')
      .add('a:1',function(args,done){
        done(new Error('bad-wire'))
      })
      .listen(30303)

    require('seneca')({log:'silent'})
      .use('../transport.js')
      .client(30303)
      .act('a:1',function(err,out){
        assert.equal('seneca: Action a:1 failed: bad-wire.',err.message)
        fin()
      })

  })


  it('error-passing-tcp', function(fin){

    require('seneca')({log:'silent'})
      .use('../transport.js')
      .add('a:1',function(args,done){
        done(new Error('bad-wire'))
      })
      .listen({type:'tcp',port:40404})

    require('seneca')({log:'silent'})
      .use('../transport.js')
      .client({type:'tcp',port:40404})
      .act('a:1',function(err,out){
        //console.log(err)
        assert.equal('seneca: Action a:1 failed: bad-wire.',err.message)
        fin()
      })
  })


  it('own-message', function(fin){
    
    // a -> b -> a

    do_type('tcp',function(err){
      if(err) return fin(err);
      do_type('http',fin)
    })

    function do_type(type,fin){

      function a(args,done){counters.a++;done(null,{aa:args.a})}
      function b(args,done){counters.b++;done(null,{bb:args.b})}

      var counters = {log_a:0,log_b:0,own:0,a:0,b:0,c:0}

      var log_a = function(){counters.log_a++;}
      var log_b = function(){counters.log_b++;}
      var own_a = function(){counters.own++;}


      var a = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{a=1\}/, handler:log_a},
          {level:'warn', regex: /own_message/, handler:own_a}
        ]},
        timeout: 111
      })
            .use('../transport.js',{
              check:{message_loop:false},
              warn:{own_message:true}
            })
            .add('a:1',a)
            .listen({type:type,port:40405})
            .client({type:type,port:40406})

      var b = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{b=1\}/, handler:log_b}
        ]},
        timeout: 111
      })
            .use('../transport.js')
            .add('b:1',b)
            .listen({type:type,port:40406})
            .client({type:type,port:40405})


      a.ready(function(){
        b.ready(function(){
          a.act('a:1',function(err,out){
            if(err) return fin(err);assert.equal(1,out.aa)})

          a.act('b:1',function(err,out){
            if(err) return fin(err);assert.equal(1,out.bb)})

          a.act('c:1',function(err,out){
            if(!err) assert.fail()
            assert.ok(err.timeout)
          })
        })})


      setTimeout(function(){
        a.close(function(err){
          if(err) return fin(err);

        ;b.close(function(err){
          if(err) return fin(err);

        ;try {
          assert.equal(1,counters.a)
          assert.equal(1,counters.b)
          assert.equal(1,counters.log_a)
          assert.equal(1,counters.log_b)
          assert.equal(1,counters.own)
        }
        catch(e) { return fin(e) }

        ;fin()

        })})
      },222)

    }
  })


  it('message-loop', function(fin){
    
    // a -> b -> c -> a

    do_type('tcp',function(err){
      if(err) return fin(err);
      do_type('http',fin)
    })

    function do_type(type,fin){

      function a(args,done){counters.a++;done(null,{aa:args.a})}
      function b(args,done){counters.b++;done(null,{bb:args.b})}
      function c(args,done){counters.c++;done(null,{cc:args.c})}

      var counters = {log_a:0,log_b:0,log_c:0,loop:0,a:0,b:0,c:0,d:0}

      var log_a = function(){counters.log_a++;}
      var log_b = function(){counters.log_b++;}
      var log_c = function(){counters.log_c++;}
      var loop_a = function(){counters.loop++;}


      var a = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{a=1\}/, handler:log_a},
          {level:'warn', regex: /message_loop/, handler:loop_a}
        ]},
        timeout: 111
      })
            .use('../transport.js',{
              check:{own_message:false},
              warn:{message_loop:true}
            })
            .add('a:1',a)
            .listen({type:type,port:40405})
            .client({type:type,port:40406})

      var b = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{b=1\}/, handler:log_b}
        ]},
        timeout: 111
      })
            .use('../transport.js')
            .add('b:1',b)
            .listen({type:type,port:40406})
            .client({type:type,port:40407})

      var c = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{c=1\}/, handler:log_c}
        ]},
        timeout: 111
      })
            .use('../transport.js')
            .add('c:1',c)
            .listen({type:type,port:40407})
            .client({type:type,port:40405})


      a.ready(function(){
        b.ready(function(){
          c.ready(function(){
            a.act('a:1',function(err,out){
              if(err) return fin(err);assert.equal(1,out.aa)})

            a.act('b:1',function(err,out){
              if(err) return fin(err);assert.equal(1,out.bb)})

            a.act('c:1',function(err,out){
              if(err) return fin(err);assert.equal(1,out.cc)})

            a.act('d:1',function(err){
              if(!err) assert.fail()
              assert.ok(err.timeout)
            })
          })})})


      setTimeout(function(){
        a.close(function(err){
          if(err) return fin(err);

        ;b.close(function(err){
          if(err) return fin(err);

        ;c.close(function(err){
          if(err) return fin(err);

        ;try {
          assert.equal(1,counters.a)
          assert.equal(1,counters.b)
          assert.equal(1,counters.c)
          assert.equal(1,counters.log_a)
          assert.equal(1,counters.log_b)
          assert.equal(1,counters.log_c)
          assert.equal(1,counters.loop)
        }
        catch(e) { return fin(e) }

        ;fin()

        })})})
      },222)

    }
  })
})
