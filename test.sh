if [ ! -d "./node_modules/seneca" ]; then
  npm install git://github.com/rjrodger/seneca#0.6.0
fi
./node_modules/.bin/mocha test/*.test.js
