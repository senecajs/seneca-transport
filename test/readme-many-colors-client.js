

var seneca = require('seneca')


seneca()

  .client({ port:8081, pin:{color:'red'} })
  .client({ port:8082, pin:{color:'green'} })
  .client({ port:8083, pin:{color:'blue'} })

  .add( 'list:colors', function( args, done ){
    var seneca = this
    var colors = {}

    args.names.forEach(function( name ){
      seneca.act({color:name}, function(err, result){
        if( err ) return done(err);

        colors[name] = result.hex
        if( Object.keys(colors).length == args.names.length ) {
          return done(null,colors)
        }
      })
    })

  })

  .listen()

  .act({list:'colors',names:['blue','green','red']},console.log)


// node readme-many-colors-client.js --seneca.log=type:act,regex:CLIENT

