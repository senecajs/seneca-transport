'use strict'

var Seneca = require('seneca')
var Entity = require('seneca-entity')
var Transport = require('../../')

function createInstance () {
  var instance = Seneca({
    default_plugins: {transport: false},
    log: 'silent'
  })

  instance.use(Transport)

  if (instance.version >= '2.0.0') {
    instance.use(Entity)
  }

  return instance
}

module.exports = createInstance
