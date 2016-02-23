/* Copyright (c) 2014 Richard Rodger */
'use strict'


// node fault.js

var Test = require('seneca-transport-test')

Test.foo_fault(require, process.argv[2] || 'tcp')
