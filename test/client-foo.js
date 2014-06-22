var type = process.argv[2]
console.log('TYPE:'+type)

require('seneca')()
  .client({type:type})
  .ready(function(){
    this.act('foo:1,bar:A',function(err,out){console.log(out)})
    this.act('foo:2,bar:B',function(err,out){console.log(out)})
  })
