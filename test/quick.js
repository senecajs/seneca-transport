
const Seneca = require('seneca')

const Transport = require('../transport')

const s0 = Seneca({ id$: 's0'})
      .test('print')
      .use(Transport)
      .listen(32123)
      .add('a:1', function a1(msg,reply) {
        reply({x:msg.x})
      })

const s1 = Seneca({ id$: 's1'})
      .test('print')
      .use(Transport)
      .client(32123)


s0.ready(function(){
  s1.ready(function(){
    s1.act('a:1,x:99', function(err, out) {
      console.log('RES', err, out)
    })
  })
})
