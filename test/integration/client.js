var seneca = require('seneca')

seneca()
  .client({ host: 'server', port: 8000 })
  .act('color:red', console.log)
