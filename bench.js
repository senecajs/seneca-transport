'use strict'

var Bench = require('fastbench')
var Seneca = require('seneca')
var Transport = require('./')

var color = function () {
  this.add('color:red', function (args, callback) {
    callback(null, { hex: '#FF0000' })
  })
}

Seneca({ log: 'silent', default_plugins: { tranport: false } }).use(color).use(Transport).listen()
var seneca = Seneca({ log: 'silent', default_plugins: { tranport: false } }).use(Transport)

var run = Bench([
  function benchSetTimeout (callback) {
    seneca.client().act('color:red', callback)
  }
], 1000)

run(function () {
  process.exit(0)
})

// Baseline before refactor is 2872 ms on mid 2015 retina pro
