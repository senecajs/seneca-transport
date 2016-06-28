'use strict'

var Seneca = require('seneca')

var Transport = require('../../')
var _ = require('lodash')

var defaults = {
  default_plugins: {transport: false},
  log: 'silent'
}

function createInstance (options, transportOptions) {
  options = _.merge({}, defaults, options)

  var instance = Seneca(options)
  instance.use(Transport, transportOptions || {})

  return instance
}

module.exports = createInstance
