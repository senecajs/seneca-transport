'use strict'

var Seneca = require('seneca')

var Transport = require('../../')

var defaults = {
  default_plugins: {transport: false},
}

function createInstance (options, transportOptions) {
  options = {...defaults, ...options}

  var instance = Seneca(options).test()
  instance.use(Transport, transportOptions || {})

  return instance
}

module.exports = createInstance
