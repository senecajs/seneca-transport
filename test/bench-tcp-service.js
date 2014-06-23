/* Copyright (c) 2014 Richard Rodger, MIT License */
"use strict";


var makeseneca = require('seneca')
var aa = function(args,done){done(null,{aa:args.a})}

makeseneca({log:'silent',stats:{duration:1000,size:99998}})
  .add( 'a:1', aa )
  .listen({type:'tcp'})



