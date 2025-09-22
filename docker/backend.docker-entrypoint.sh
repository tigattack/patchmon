#!/bin/sh

# Enable strict error handling
set -e

# Function to log messages with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "Starting PatchMon Backend..."

log "Running database migrations..."
npx prisma migrate deploy

log "Starting application..."
exec npm start
