'use strict'

var Lab = require('@hapi/lab')
var Shared = require('seneca-transport-test')
var CreateInstance = require('./utils/createInstance')

var lab = (exports.lab = Lab.script())

// These tests are currently skipped until the source of a
// timeout on 0.10, 0.12, and intermittently on 4 is found

Shared.basictest({
  seneca: CreateInstance(),
  script: lab,
  type: 'tcp',
})

Shared.basicpintest({
  seneca: CreateInstance(),
  script: lab,
  type: 'tcp',
})

Shared.basictest({
  seneca: CreateInstance(),
  script: lab,
  type: 'http',
})

Shared.basicpintest({
  seneca: CreateInstance(),
  script: lab,
  type: 'http',
})
