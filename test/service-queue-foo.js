require('seneca')()
  .use('foo')
  .listen( {type:'queue',pin:'foo:*'} )
