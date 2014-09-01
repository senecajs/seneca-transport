
var color  = process.argv[2]
var hexval = process.argv[3]
var port   = process.argv[4]

var seneca = require('seneca')

seneca()

  .add( 'color:'+color, function(args,done){
    done(null, {hex:'#'+hexval});
  })

  .listen( port )
  .log.info('color',color,hexval,port)

// node readme-many-colors-server.js red FF000 8081 --seneca.log=level:info --seneca.log=type:act,regex:color


