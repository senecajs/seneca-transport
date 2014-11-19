if [ ! -d "./node_modules/seneca" ]; then
  npm install git://github.com/rjrodger/seneca
fi
./node_modules/.bin/mocha test/*.test.js
