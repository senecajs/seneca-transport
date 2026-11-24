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
  .listen()

Seneca()
  .use(Transport)
  .client()
  .act('color:red')

// node readme-color.js --seneca.log=type:act,regex:color:red
