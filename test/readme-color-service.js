
function color() {
  this.add( 'color:red', function(args,done){
    done(null, {hex:'#FF0000'});
  })
}


var seneca = require('seneca')
      
seneca()
  .use(color)
  .listen()


// node readme-color-service.js --seneca.log=type:act,regex:color:red

