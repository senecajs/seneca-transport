var Transport = require('./transport')
var Seneca = require('seneca')

var color = function () {
  this.add('color:red', function (args, callback) {
    callback(null, { hex: '#000000' });
  })
}

Seneca({
    default_plugins: {
      transort: false
    }
  })
  .use(Transport)
  .use(color)
  .listen({ port: 8000 })
