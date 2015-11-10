FROM node

RUN mkdir -p /seneca-transport
WORKDIR /seneca-transport
COPY package.json package.json
COPY transport.js transport.js
COPY lib/ lib/
COPY test/integration/server.js server.js
COPY test/integration/client.js client.js

RUN npm install
