require('seneca')()
  .use('..')
  .use('foo')
  .listen( {type:'queue',pin:'foo:*'} )
