FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build
RUN npm install --only=production

EXPOSE 3000

CMD ["node", "server.js"]