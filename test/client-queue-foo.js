require('seneca')()
  .declare('foo')
  .client({type:'queue',pin:'foo:*'})
  .ready(function(){
    this.act('foo:1,bar:A',function(err,out){console.log(out)})
    this.act('foo:2,bar:B',function(err,out){console.log(out)})
  })
