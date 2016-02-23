module.exports = function () {
  this.add('foo:1', function (args, done){done(null, {s: '1-' + args.bar})} )
  this.add('foo:2', function (args, done){done(null, {s: '2-' + args.bar})} )
  this.add('foo:3', function (args, done){done(null, {s: '3-' + args.bar})} )
  this.add('foo:4', function (args, done){done(null, {s: '4-' + args.bar})} )
  this.add('foo:5', function (args, done){done(null, {s: '5-' + args.bar})} )

  this.add('bad:1', function (args, done){done(new Error('ouch'))})
}
