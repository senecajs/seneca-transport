'use strict'

var Seneca = require('seneca')

Seneca()
  .client()
  .act('color:red')

// node readme-color-client.js --seneca.log=type:act,regex:color:red
