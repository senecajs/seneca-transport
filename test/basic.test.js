'use strict'

var Seneca = require('seneca')
var Shared = require('seneca-transport-test')
var Transport = require('../')
var Entity = require('seneca-entity')
var Lab = require('lab')

var lab = exports.lab = Lab.script()

function createInstance (tag) {
  var opts = {
    default_plugins: {transport: false},
    log: 'silent'
  }

  return Seneca(opts)
}

Shared.basictest({
  seneca: createInstance().use(Entity).use(Transport),
  script: lab,
  type: 'tcp'
})

Shared.basicpintest({
  seneca: createInstance().use(Entity).use(Transport),
  script: lab,
  type: 'tcp'
})

Shared.basictest({
  seneca: createInstance().use(Entity).use(Transport),
  script: lab,
  type: 'http'
})

Shared.basicpintest({
  seneca: createInstance().use(Entity).use(Transport),
  script: lab,
  type: 'http'
})
