/* Copyright (c) 2013-2015 Richard Rodger */
'use strict'

var Code = require('code')
var Lab = require('lab')
var Seneca = require('seneca')
var Http = require('../lib/http')
var TransportUtil = require('../lib/transport-utils')
var Wreck = require('wreck')

// Test shortcuts

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var expect = Code.expect


describe('http', function () {
  describe('listen()', function () {
    it('can listen on ephemeral port', function (done) {
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        web: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var http = Http.listen(settings, transportUtil)
      expect(typeof http).to.equal('function')

      http.call(seneca, { type: 'web' }, function (err) {
        expect(err).to.not.exist()
        done()
      })
    })
  })

  describe('client()', function () {
    it('defaults to 127.0.0.1 for connections', function (done) {
      var seneca = Seneca({
        log: 'silent',
        default_plugins: {
          transport: false
        }
      })

      var settings = {
        web: {
          port: 0
        }
      }

      var callmap = {}

      var transportUtil = new TransportUtil({
        callmap: callmap,
        seneca: seneca,
        options: settings
      })

      var server = Http.listen(settings, transportUtil)
      expect(typeof server).to.equal('function')

      server.call(seneca, { type: 'web' }, function (err, address) {
        expect(err).to.not.exist()

        settings.web.port = address.port
        var client = Http.client(settings, transportUtil)
        expect(typeof client).to.equal('function')
        client.call(seneca, { type: 'web' }, function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })

  describe('http (running on https protocol)', function () {
    it('Creates a seneca server running on port 8000 https and expects hex to be equal to #FF0000', function (done) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      function color () {
        this.add('color:red', function (args, done) {
          done(null, {hex: '#FF0000'})
        })
      }

      Seneca({
        log: 'silent',
      })
        .use('../transport')
        .use(color)
        .listen({
          type: 'web',
          port: 8000,
          host: '127.0.0.1',
          protocol: 'https',
          serverOptions : {
            keyPemPath : './ssl/key.pem',
            certPemPath : './ssl/cert.pem'
          }
        })
        .ready(function(){

          Seneca({
            log: 'silent',
          })
            .use('../transport')
            .client({
              type: 'http',
              port: 8000,
              host: '127.0.0.1',
              protocol: 'https'
            })
            .act('color:red', function(error, res){
              expect(res.hex).to.be.equal('#FF0000');
              done()
            })
        })
    })
  })

  describe('http (running on https protocol)', function () {
    it('Creates a seneca server running on port 8000 https and expects hex to be equal to #FF0000 (wreck client)', function (done) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      var StringDecoder = require('string_decoder').StringDecoder;
      var decoder = new StringDecoder('utf8');
      Wreck.request('get', 'https://127.0.0.1:8000/act?color=red', { rejectUnauthorized: false }, (err, res) => {

         res.on('data', function(d) {
           var data = decoder.write(d);
           // console.log('data', data);
           expect(data).to.be.equal('{"hex":"#FF0000"}');

           done();
         });

          expect(err).to.not.exist();

      });


    })
  })



})
