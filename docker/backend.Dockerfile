FROM node:lts-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copy backend package files
COPY --chown=node:node backend/package*.json /app/backend/

WORKDIR /app/backend

# Install backend dependencies (now has its own package-lock.json)
RUN npm ci --ignore-scripts

# Copy backend source after dependencies are installed
COPY --chown=node:node backend/ /app/backend/

# Generate Prisma client and clean up
RUN npx prisma generate &&\
    npm prune --omit=dev &&\
    npm cache clean --force

FROM node:lts-alpine

ENV NODE_ENV=production \
    ENABLE_LOGGING=true \
    LOG_LEVEL=info \
    PM_LOG_TO_CONSOLE=true \
    PORT=3001

RUN apk add --no-cache openssl tini curl

USER node

WORKDIR /app

COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/node_modules /app/node_modules
COPY --chown=node:node agents ./agents_backup
COPY --chown=node:node agents ./agents
COPY --chmod=755 docker/backend.docker-entrypoint.sh ./entrypoint.sh

WORKDIR /app/backend

EXPOSE 3001

VOLUME [ "/app/agents" ]

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/entrypoint.sh"]
