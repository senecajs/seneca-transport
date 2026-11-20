'use strict'

var Seneca = require('seneca')
var Transport = require('../../transport.js')

Seneca()
  .use(Transport)
  .client()
  .act('color:red')

// node readme-color-client.js --seneca.log=type:act,regex:color:red
