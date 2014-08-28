
var seneca = require('seneca')
      
seneca()
  .client()
  .act('color:red')

// node readme-color-client.js --seneca.log=type:act,regex:color:red

