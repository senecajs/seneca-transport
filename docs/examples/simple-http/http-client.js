'use strict'

let seneca = require('seneca')()
seneca.use('../../../transport').ready(function () {
  this.act({foo: 'one', bar: 'aloha'}, function (err, response) {
    if (err) {
      return console.log(err)
    }
    console.log(response)
  })
}).client({type: 'http', pin: 'foo:one'})
