
tcp single run:

$ node service-foo.js tcp --seneca.log.all
$ node client-foo.js tcp --seneca.log.all

web single run:

$ node service-foo.js web --seneca.log.all
$ node client-foo.js web --seneca.log.all

server & client running on https://127.0.0.1:8000 (https)

Create a folder 'ssl' within 'test' folder (ie ./test/ssl)
Create a self-signed certificate with OpenSSL by running within the ./ssl folder:

$ openssl genrsa -out key.pem 2048
$ openssl req -new -key key.pem -out csr.pem
$ openssl req -x509 -days 365 -key key.pem -in csr.pem -out cert.pem

Then from within ./test folder run:

$ node readme-color-web-https.js
