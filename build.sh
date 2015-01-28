if [ ! -d "./node_modules/docco" ]; then
  npm install docco@0
fi
if [ ! -d "./node_modules/jshint" ]; then
  npm install jshint@2
fi


./node_modules/.bin/jshint transport.js
./node_modules/.bin/docco transport.js -o doc
cp -r doc/* ../gh-pages/seneca-transport/doc
