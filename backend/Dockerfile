FROM node:lts-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY backend/package*.json ./

RUN npm install --only=production
RUN npm install -g prisma

COPY backend/ .

COPY agents/ ./agents

RUN npx prisma generate

RUN mkdir -p logs

EXPOSE 3001

CMD ["sh", "-c", "sleep 10 && npx prisma migrate deploy && npm start"]