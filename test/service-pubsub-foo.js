require('seneca')()
  .use('foo')
  .listen( {type:'pubsub',pin:'foo:*'} )
