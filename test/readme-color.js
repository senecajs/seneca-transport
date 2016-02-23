'use strict'

function color () {
  this.add('color:red', function (args, done) {
    done(null, {hex: '#FF0000'})
  })
}


var Seneca = require('seneca')

Seneca()
  .use(color)
  .listen()

Seneca()
  .client()
  .act('color:red')

// node readme-color.js --seneca.log=type:act,regex:color:red
