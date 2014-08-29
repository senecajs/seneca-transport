
function color() {
  this.add( 'color:red', function(args,done){
    done(null, {hex:'#FF0000'});
  })
}


var seneca = require('seneca')


seneca()
  .use(color)
  .listen({type:'tcp'})

seneca()
  .client({type:'tcp'})
  .act('color:red')

// node readme-color-tcp.js --seneca.log=plugin:transport,level:INFO --seneca.log=type:act,regex:color:red



