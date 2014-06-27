
tcp single run:

$ node service-foo.js tcp --seneca.log.all
$ node client-foo.js tcp --seneca.log.all


web single run:

$ node service-foo.js web --seneca.log.all
$ node client-foo.js web --seneca.log.all


benchmarking:

inside one process:

$ node bench-internal.js tcp
$ node bench-internal.js web

separate client and server:

$ node bench-server.js tcp
$ node bench-external.js tcp

$ node bench-server.js web
$ node bench-external.js web


