var seneca = require('seneca')

var color = function () {
  this.add('color:red', function (args, callback) {
    callback(null, { hex: '#FF0000' });
  })
}

seneca()
  .use(color)
  .listen({ port: 8000 })
