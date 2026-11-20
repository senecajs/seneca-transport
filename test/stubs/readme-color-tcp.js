'use strict'

function color () {
  this.add('color:red', function (args, done) {
    done(null, {hex: '#FF0000'})
  })
}


var Seneca = require('seneca')
var Transport = require('../../transport.js')

Seneca()
  .use(Transport)
  .use(color)
  .listen({type: 'tcp'})

Seneca()
  .use(Transport)
  .client({type: 'tcp'})
  .act('color:red')

// node readme-color-tcp.js --seneca.log=plugin:transport,level:INFO --seneca.log=type:act,regex:color:red
