var type = process.argv[2]
console.log('TYPE:'+type)

require('seneca')()
  .use('../transport.js')
  .client({type:type})
  .ready(function(){
    var seneca = this
    seneca.act('foo:1,bar:A',function(err,out){console.log(out)})
    seneca.act('foo:2,bar:B',function(err,out){console.log(out)})

    setInterval(function(){
      seneca.act('foo:3,bar:C',function(err,out){console.log(out)})
    },1000)
  })
