'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function color () {
  this.add('color:red', function (args, done) {
    console.log('Connected to client! Color returned:', {hex: '#FF0000'})
    done(null, {hex: '#FF0000'})
  })
}


var Seneca = require('seneca')

Seneca()
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

    Seneca()
      .use('../transport')
      .client({
        type: 'http',
        port: 8000,
        host: '127.0.0.1',
        protocol: 'https'
      })
      .act('color:red', function(error, res){
        console.log('Result from service: ', res);
      })

  })



// node readme-color.js --seneca.log=type:act,regex:color:red
