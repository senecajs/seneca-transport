module.exports = function() {
  this.add( 'foo:1', function(args,done){done(null,'1-'+args.bar)} )
  this.add( 'foo:2', function(args,done){done(null,'2-'+args.bar)} )
}
