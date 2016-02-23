'use strict'

var seneca = require('seneca')


seneca()

  // send matching actions out over the network
  .client({ port: 8081, pin: 'color:red' })
  .client({ port: 8082, pin: 'color:green' })
  .client({ port: 8083, pin: 'color:blue' })

  // an aggregration action that calls other actions
  .add('list:colors', function (args, done) {
    var seneca = this
    var colors = {}

    args.names.forEach(function (name) {
      seneca.act({color: name}, function (err, result){
        if (err) {
          return done(err)
        }

        colors[name] = result.hex
        if (Object.keys(colors).length === args.names.length) {
          return done(null, colors)
        }
      })
    })

  })

  .listen()

  // this is a sanity check
  .act({list:'colors', names: ['blue','green','red']}, console.log)

// node readme-many-colors-client.js --seneca.log=type:act,regex:CLIENT
