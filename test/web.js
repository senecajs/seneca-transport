
const Seneca = require('Seneca')


const s0 = Seneca({ tag: 's0' })
      .test()
      .use('../')

const c0 = Seneca({
  tag: 'c0',
})
      .test()
      .use('../')

s0
  .add('a:1', function a1(msg, reply, meta) {
    reply({ x: msg.x, w: Date.now() })
  })
  .listen(62010)
  .ready(function () {
    
    c0
      .client(62010)
      .act('a:1,x:2', function (err, out, meta) {
        console.log(err, out)
        console.dir(meta,{depth:null})
      })
  })
