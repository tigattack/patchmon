# PatchMon Docker

## Overview

PatchMon is a containerised application that monitors system patches and updates. The application consists of three main services:

- **Database**: PostgreSQL 17
- **Backend**: Node.js API server
- **Frontend**: React application served via Nginx

## Images

- **Backend**: `ghcr.io/9technologygroup/patchmon-backend:latest`
- **Frontend**: `ghcr.io/9technologygroup/patchmon-frontend:latest`

Version tags are also available (e.g. `1.2.3`) for both of these images.

## Quick Start

### Production Deployment

1. Download the [Docker Compose file](docker-compose.yml)
2. Change the default database password in the file:
   ```yaml
   environment:
     POSTGRES_PASSWORD: YOUR_SECURE_PASSWORD_HERE
   ```
3. Update the corresponding `DATABASE_URL` in the backend service:
   ```yaml
   environment:
     DATABASE_URL: postgresql://patchmon_user:YOUR_SECURE_PASSWORD_HERE@database:5432/patchmon_db
   ```
4. Configure environment variables (see [Configuration](#configuration) section)
5. Start the application:
   ```bash
   docker compose up -d
   ```
6. Access the application at `http://localhost:3000`

## Configuration

### Environment Variables

#### Database Service

- `POSTGRES_DB`: Database name (default: `patchmon_db`)
- `POSTGRES_USER`: Database user (default: `patchmon_user`)
- `POSTGRES_PASSWORD`: Database password - **MUST BE CHANGED!**

#### Backend Service

- `LOG_LEVEL`: Logging level (`debug`, `info`, `warn`, `error`)
- `DATABASE_URL`: PostgreSQL connection string
- `PM_DB_CONN_MAX_ATTEMPTS`: Maximum database connection attempts (default: 30)
- `PM_DB_CONN_WAIT_INTERVAL`: Wait interval between connection attempts in seconds (default: 2)
- `SERVER_PROTOCOL`: Frontend server protocol (`http` or `https`)
- `SERVER_HOST`: Frontend server host (default: `localhost`)
- `SERVER_PORT`: Frontend server port (default: 3000)
- `PORT`: Backend API port (default: 3001)
- `API_VERSION`: API version (default: `v1`)
- `CORS_ORIGIN`: CORS origin URL
- `RATE_LIMIT_WINDOW_MS`: Rate limiting window in milliseconds (default: 900000)
- `RATE_LIMIT_MAX`: Maximum requests per window (default: 100)
- `ENABLE_HSTS`: Enable HTTP Strict Transport Security (default: true)
- `TRUST_PROXY`: Trust proxy headers (default: true) - See [Express.js docs](https://expressjs.com/en/guide/behind-proxies.html) for usage.

#### Frontend Service

- `BACKEND_HOST`: Backend service hostname (default: `backend`)
- `BACKEND_PORT`: Backend service port (default: 3001)

### Volumes

The compose file creates two Docker volumes:

* `postgres_data`: PostgreSQL's data directory.
* `agent_files`: PatchMon's agent files.

If you wish to bind either if their respective container paths to a host path rather than a Docker volume, you can do so in the Docker Compose file.

> [!TIP]
> The backend container runs as user & group ID 1000. If you plan to re-bind the agent files directory, ensure that the same user and/or group ID has permission to write to the host path to which it's bound.

---

# Development

This section is for developers who want to contribute to PatchMon or run it in development mode.

## Development Setup

For development with live reload and source code mounting:

1. Clone the repository:
   ```bash
   git clone https://github.com/9technologygroup/patchmon.net.git
   cd patchmon.net
   ```

2. Start development environment:
   ```bash
   # Attached, live log output, services stopped on Ctrl+C
   docker compose -f docker/docker-compose.dev.yml up

   # Detached
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

## Development Docker Compose

The development compose file (`docker/docker-compose.dev.yml`):
- Builds images locally from source
- Enables development workflow  
- Supports live reload and debugging

## Building Images Locally

```
docker build -t patchmon-backend:dev -f docker/backend.Dockerfile .
docker build -t patchmon-frontend:dev -f docker/frontend.Dockerfile .
```

## Running in Docker Compose

For development or custom builds:

```bash
# Build backend image
docker build -f docker/backend.Dockerfile -t patchmon-backend:dev .

# Build frontend image  
docker build -f docker/frontend.Dockerfile -t patchmon-frontend:dev .
```

## Development Commands

### Rebuild Services
```bash
# Rebuild specific service
docker compose -f docker/docker-compose.dev.yml up -d --build backend

# Rebuild all services
docker compose -f docker/docker-compose.dev.yml up -d --build
```

## Development Workflow

1. **Code Changes**: Edit source files
2. **Rebuild**: `docker compose -f docker/docker-compose.dev.yml up -d --build`
3. **Test**: Access application and verify changes
4. **Debug**: Check logs with `docker compose logs -f`
