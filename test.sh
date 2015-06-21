if [ "link" == "$1" ]; then
  rm -rf ./node_modules/seneca
  ln -s ../../seneca ./node_modules
fi

if [ "plugin" == "$1" ]; then
  rm -rf ./node_modules/seneca
fi

if [ ! -d "./node_modules/seneca" ]; then
  npm install seneca@plugin
fi

./node_modules/.bin/mocha test/*.test.js
