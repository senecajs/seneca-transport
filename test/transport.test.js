/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'


// mocha transport.test.js

var assert = require('assert')
var seneca = require('seneca')
var shared   = require('seneca-transport-test')
var wreck = require('wreck')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it

var no_t = {transport:false}

process.setMaxListeners(999)


function run_client( type, port, done, tag ) {
  require('seneca')({tag:tag,log:'silent',default_plugins:no_t,debug:{short_logs:true}})
    .use('../transport')
    .client({type:type,port:port})
    .ready( function() {

      this.act('c:1,d:A',function(err,out){
        if(err) return fin(err);

        assert.equal( '{"s":"1-A"}', JSON.stringify(out) )

        this.act('c:1,d:AA',function(err,out){
          if(err) return fin(err);

          assert.equal( '{"s":"1-AA"}', JSON.stringify(out) )

          this.close(done)
        })
      })
    })
}

function get_seneca(tag) {
  return require('seneca')({tag:tag, log:'silent', default_plugins: no_t, debug: {short_logs:true}}).use('../transport')
}

describe('transport', function() {

  shared.basictest({
    seneca: get_seneca(),
    script: lab,
    type: 'tcp'
  })

  shared.basicpintest({
    seneca: get_seneca(),
    script: lab,
    type: 'tcp'
  })

  shared.basictest({
    seneca: get_seneca(),
    script: lab,
    type: 'web'
  })

  shared.basicpintest({
    seneca: get_seneca(),
    script: lab,
    type: 'web'
  })

  it('tcp-basic', function( fin ) {

    require('seneca')({tag:'srv',log:'silent',default_plugins:no_t,debug:{short_logs:true}})
      .use('../transport.js')
      .add( 'c:1', function(args,done){done(null,{s:'1-'+args.d})} )
      .listen({type:'tcp',port:20102})
      .ready( function() {
        var seneca = this

        var count = 0
        function check() {
          count++
          if( 3 == count ) {
            seneca.close(fin)
          }
        }

        run_client( 'tcp', 20102, check, 'cln0' )
        run_client( 'tcp', 20102, check, 'cln1' )
        run_client( 'tcp', 20102, check, 'cln2' )
      })
  })


  it('web-basic', function( fin ) {
    require('seneca')({log:'silent',errhandler:fin,default_plugins:no_t})
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

        var requestOptions = {
          payload: JSON.stringify({ c: 1, d: 'A' }),
          json: true
        }
        // special case for non-seneca clients
        wreck.post(
          'http://localhost:20202/act',
          requestOptions,
          function(err, res, body){
            if( err ) return fin(err)
            assert.equal( '{"s":"1-A"}', JSON.stringify(body) )
            check()
          })
      })
  })


  it('web-query', function( fin ) {
    require('seneca')({log:'silent',errhandler:fin,default_plugins:no_t})
      .use('../transport.js')
      .add( 'a:1', function(args,done){done(null,this.util.clean(args))} )
      .listen({type:'web',port:20302})
      .ready( function() {

        ;wreck.get(
          'http://localhost:20302/act?a=1&b=2', { json: true },
          function(err, res, body){
            if( err ) return fin(err)
            assert.equal(1,body.a)
            assert.equal(2,body.b)

        ;wreck.get(
          'http://localhost:20302/act?args$=a:1,b:2,c:{d:3}', { json: true },
          function(err, res, body){
            if( err ) return fin(err)
            assert.equal(1,body.a)
            assert.equal(2,body.b)
            assert.equal(3,body.c.d)

        ;fin()

       }) }) })
  })


  it('error-passing-http', function (fin) {
    require('seneca')({ log: 'silent', default_plugins: no_t })
      .use('../transport.js')
      .add('a:1', function (args, done) {
        done(new Error('bad-wire'))
      })
      .listen(30303)

    require('seneca')({ log: 'silent' })
      .use('../transport.js')
      .client(30303)
      .act('a:1', function (err, out) {
        assert.equal('seneca: Action a:1 failed: bad-wire.', err.message)
        fin()
      })
  })


  it('error-passing-tcp', function(fin){

    require('seneca')({log:'silent',default_plugins:no_t})
      .use('../transport.js')
      .add('a:1',function(args,done){
        done(new Error('bad-wire'))
      })
      .listen({type:'tcp',port:40404})

    require('seneca')({log:'silent',default_plugins:no_t})
      .use('../transport.js')
      .client({type:'tcp',port:40404})
      .act('a:1',function(err,out){
        assert.equal('seneca: Action a:1 failed: bad-wire.',err.message)
        fin()
      })
  })


  // NOTE: SENECA_LOG=all will break this test as it counts log entries
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
          {level:'debug', regex: /\{a:1\}/, handler:log_a},
          {level:'warn', regex: /own_message/, handler:own_a}
        ]},
        timeout: 111,
        default_plugins:no_t
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
          {level:'debug', regex: /\{b:1\}/, handler:log_b}
        ]},
        timeout: 111,
        default_plugins:no_t
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


  // NOTE: SENECA_LOG=all will break this test as it counts log entries
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
          {level:'debug', regex: /\{a:1\}/, handler:log_a},
          {level:'warn', regex: /message_loop/, handler:loop_a}
        ]},
        timeout: 111,
        default_plugins:no_t
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
          {level:'debug', regex: /\{b:1\}/, handler:log_b}
        ]},
        timeout: 111,
        default_plugins:no_t
      })
            .use('../transport.js')
            .add('b:1',b)
            .listen({type:type,port:40406})
            .client({type:type,port:40407})

      var c = require('seneca')({
        log:{map:[
          {level:'debug', regex: /\{c:1\}/, handler:log_c}
        ]},
        timeout: 111,
        default_plugins:no_t
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


  it('testmem-topic-star', function(fin){
    seneca({tag:'srv',timeout:5555,log:'silent',debug:{short_logs:true}})
      .use('../transport')
      .use( './memtest-transport.js' )
      .add('foo:1',function(args,done){
        assert.equal('aaa/AAA',args.meta$.id)
        done(null,{bar:1})
      })
      .add('foo:2',function(args,done){
        assert.equal('bbb/BBB',args.meta$.id)
        done(null,{bar:2})
      })
      .listen( {type:'memtest',pin:'foo:*'} )
      .ready(function(){

        seneca({tag:'cln',timeout:5555,log:'silent',
                debug:{short_logs:true}})

          .use('../transport')
          .use( './memtest-transport.js' )

          .client( {type:'memtest', pin:'foo:*'} )

          .start(fin)

          .wait('foo:1,id$:aaa/AAA')
          .step(function(out){
            assert.equal(1,out.bar)
            return true;
          })

          .wait('foo:2,id$:bbb/BBB')
          .step(function(out){
            assert.equal(2,out.bar)
            return true;
          })

          .end()
      })
  })


  it('catchall-ordering', function(fin){
    seneca({tag:'srv',timeout:5555,log:'silent',debug:{short_logs:true}})
      .use('../transport')
      .use( './memtest-transport.js' )

      .add('foo:1',function(args,done){
        done(null,{FOO:1})
      })

      .add('bar:1',function(args,done){
        done(null,{BAR:1})
      })

      .listen( {type:'memtest', dest:'D0', pin:'foo:*'} )
      .listen( {type:'memtest', dest:'D1'} )

      .ready(function(){

        do_catchall_first()

        function do_catchall_first(err) {
          seneca({tag:'cln0',timeout:5555,log:'silent',
                  debug:{short_logs:true}})

            .use('../transport')
            .use( './memtest-transport.js' )

            .client( {type:'memtest', dest:'D1' } )
            .client( {type:'memtest', dest:'D0', pin:'foo:*'} )

            .start(fin)

            .wait('foo:1')
            .step(function(out){
              assert.equal(1,out.FOO)
              return true;
            })

            .wait('bar:1')
            .step(function(out){
              assert.equal(1,out.BAR)
              return true;
            })

            .end( do_catchall_last )
        }

        function do_catchall_last(err) {
          if(err) return fin(err);

          seneca({tag:'cln1',timeout:5555,log:'silent',
                  debug:{short_logs:true}})

            .use('../transport')
            .use( './memtest-transport.js' )

            .client( {type:'memtest', dest:'D0', pin:'foo:*'} )
            .client( {type:'memtest', dest:'D1'} )

            .start(fin)

            .wait('foo:1')
            .step(function(out){
              assert.equal(1,out.FOO)
              return true;
            })

            .wait('bar:1')
            .step(function(out){
              assert.equal(1,out.BAR)
              return true;
            })

            .end()
        }
      })
  })



})
