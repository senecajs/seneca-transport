'use strict'

var Seneca = require('seneca')
var _ = require('lodash')

function createInstance (tag, plugins) {
  plugins = plugins || []

  var instance = Seneca({
    default_plugins: {transport: false},
    log: 'silent',
    tag: tag
  })

  _.each(plugins, function (plugin) {
    instance.use(plugin)
  })

  return instance
}

module.exports = createInstance
