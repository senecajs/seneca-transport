'use strict'

let seneca = require('seneca')()
seneca.use('../../../transport').ready(function () {
  this.add({foo: 'one'}, function (args, done) {
    done(null, {bar: args.bar})
  })
})

seneca.listen({type: 'http', pin: 'foo:one'})
