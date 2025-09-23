#!/bin/sh

# Enable strict error handling
set -e

# Function to log messages with timestamp
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Copy files from agents_backup to agents if agents directory is empty
if [ -d "/app/agents" ] && [ -z "$(ls -A /app/agents 2>/dev/null)" ]; then
    if [ -d "/app/agents_backup" ]; then
        log "Agents directory is empty, copying from backup..."
        cp -r /app/agents_backup/* /app/agents/
    else
        log "Warning: agents_backup directory not found"
    fi
else
    log "Agents directory already contains files, skipping copy"
fi

log "Starting PatchMon Backend..."

log "Running database migrations..."
npx prisma migrate deploy

log "Starting application..."
exec npm start
