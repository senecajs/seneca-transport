'use strict'

var Lab = require('lab')
var Shared = require('seneca-transport-test')
var CreateInstance = require('./utils/createInstance')

var lab = exports.lab = Lab.script()

Shared.basictest({
  seneca: CreateInstance(),
  script: lab,
  type: 'tcp'
})

Shared.basicpintest({
  seneca: CreateInstance(),
  script: lab,
  type: 'tcp'
})

Shared.basictest({
  seneca: CreateInstance(),
  script: lab,
  type: 'http'
})

Shared.basicpintest({
  seneca: CreateInstance(),
  script: lab,
  type: 'http'
})
