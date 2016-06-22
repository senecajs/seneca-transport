'use strict'

var Seneca = require('seneca')
var Entity = require('seneca-entity')
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

  if (instance.version >= '2.0.0') {
    instance.use(Entity)
  }

  return instance
}

module.exports = createInstance
