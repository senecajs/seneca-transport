var Transport = require('./transport')
var Seneca = require('seneca')

Seneca({
    default_plugins: {
      transort: false
    }
  })
  .use(Transport)
  .client({ host: 'server', port: 8000 })
  .act('color:red', console.log)
