FROM node:lts-alpine AS builder

WORKDIR /app

# Copy frontend package files
COPY frontend/package*.json ./frontend/

WORKDIR /app/frontend

# Install frontend dependencies (now has its own package-lock.json)
RUN npm ci --ignore-scripts

# Copy frontend source after dependencies are installed
COPY frontend/ ./

# Build the frontend
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine

ENV BACKEND_HOST=backend \
    BACKEND_PORT=3001

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
