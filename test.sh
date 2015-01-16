if [ ! -d "./node_modules/seneca" ]; then
  npm install seneca@~0.5.21
fi

# The published 0.2.6 release is broken, and tests
# will fail if we do not remove it
rm -rf node_modules/seneca/node_modules/seneca-transport
./node_modules/.bin/mocha -R spec test/*.test.js

