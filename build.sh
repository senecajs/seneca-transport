./node_modules/.bin/jshint transport.js lib/*.js
./node_modules/.bin/docco transport.js -o doc
cp -r doc/* ../gh-pages/seneca-transport/doc
