FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production
RUN npm install -g prisma

COPY . .

RUN npx prisma generate

RUN mkdir -p logs

EXPOSE 3001

RUN echo '#!/bin/sh\n\
echo "Waiting for database..."\n\
sleep 10\n\
echo "Running database migrations..."\n\
npx prisma migrate deploy\n\
echo "Starting server..."\n\
npm start' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]