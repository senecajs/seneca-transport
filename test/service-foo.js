var type = process.argv[2]
console.log('TYPE:'+type)

require('seneca')()
  .use('../transport.js')
  .use('foo')
  .listen({type:type})
