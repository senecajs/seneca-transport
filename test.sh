if [ ! -d "./node_modules/seneca" ]; then
  npm install seneca@plugin
fi
if [ ! -d "./node_modules/seneca-transport-test" ]; then
  npm install seneca-transport-test@0.1
fi
if [ ! -d "./node_modules/mocha" ]; then
  npm install mocha@1
fi
./node_modules/.bin/mocha test/*.test.js
