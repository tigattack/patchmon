#!/bin/sh

# Enable strict error handling
set -e

# Function to log messages with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "Starting PatchMon Backend (${NODE_ENV:-production})..."

log "Running database migrations..."
npx prisma migrate deploy

log "Starting application..."
if [ "${NODE_ENV}" = "development" ]; then
    exec npm run dev
else
    exec npm start
fi
