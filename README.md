# PatchMon - Linux Patch Monitoring System

A comprehensive system for monitoring Linux package updates across multiple hosts with a modern web interface and automated agent deployment.

## Features

- **Multi-Host Monitoring**: Monitor package updates across multiple Linux servers
- **Real-time Dashboard**: Web-based dashboard with statistics and host management
- **Automated Agents**: Lightweight agents for automatic data collection
- **Host Grouping**: Organize hosts into groups for better management
- **Repository Tracking**: Monitor APT/YUM repositories and their usage
- **Security Updates**: Track security-specific package updates
- **User Management**: Role-based access control with granular permissions
- **Dark Mode**: Modern UI with dark/light theme support
- **Agent Versioning**: Manage and auto-update agent versions
- **API Credentials**: Secure agent authentication system

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 12 or higher
- **Linux**: Ubuntu, Debian, CentOS, RHEL, or Fedora (for agents)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd patchmon
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```sql
CREATE DATABASE patchmon;
CREATE USER patchmon_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE patchmon TO patchmon_user;
```

### 3. Environment Configuration

Create `.env` file in the project root:

```bash
# Database
DATABASE_URL="postgresql://patchmon_user:your_secure_password@localhost:5432/patchmon?schema=public"

# Backend
NODE_ENV=production
PORT=3001
API_VERSION=v1

# Security
CORS_ORIGINS=https://your-frontend.example
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_WINDOW_MS=600000
AUTH_RATE_LIMIT_MAX=20
AGENT_RATE_LIMIT_WINDOW_MS=60000
AGENT_RATE_LIMIT_MAX=120
ENABLE_HSTS=true
TRUST_PROXY=1
JSON_BODY_LIMIT=5mb
ENABLE_LOGGING=false
LOG_LEVEL=info

# JWT Secret (generate a strong secret)
JWT_SECRET=your-super-secure-jwt-secret-here

# Frontend
VITE_API_URL=https://your-api.example/api/v1
```

### 4. Database Migration

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### 5. Create Admin User

```bash
cd backend
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin'
    }
  });
  console.log('Admin user created: admin / admin123');
  await prisma.\$disconnect();
}

createAdmin().catch(console.error);
"
```

### 6. Start Services

**Development:**
```bash
# Start both backend and frontend
npm run dev

# Or start individually
npm run dev:backend
npm run dev:frontend
```

**Production:**
```bash
# Build frontend
npm run build:frontend

# Start backend
cd backend
npm start
```

### 7. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Default Login**: admin / admin123

## Agent Installation

### Automatic Installation

1. **Create a Host** in the web interface
2. **Copy the installation command** from the host detail page
3. **Run on your Linux server**:

```bash
curl -sSL https://your-patchmon-server.com/api/v1/hosts/install | bash -s -- your-api-id your-api-key
```

### Manual Installation

1. **Download the agent script**:
```bash
wget https://your-patchmon-server.com/api/v1/hosts/agent/download
chmod +x patchmon-agent.sh
sudo mv patchmon-agent.sh /usr/local/bin/
```

2. **Configure with API credentials**:
```bash
sudo /usr/local/bin/patchmon-agent.sh configure your-api-id your-api-key
```

3. **Test the connection**:
```bash
sudo /usr/local/bin/patchmon-agent.sh test
```

4. **Start monitoring**:
```bash
sudo /usr/local/bin/patchmon-agent.sh update
```

## Configuration

### Backend Configuration

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Required | PostgreSQL connection string |
| `JWT_SECRET` | Required | Secret for JWT token signing |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `ENABLE_LOGGING` | `false` | Enable file logging |
| `TRUST_PROXY` | `1` | Trust reverse proxy headers |

### Frontend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api/v1` | Backend API URL |
| `VITE_ENABLE_LOGGING` | `false` | Enable dev server logging |

### Agent Configuration

The agent automatically configures itself with:
- **Update interval**: Set in PatchMon settings (default: 60 minutes)
- **Auto-update**: Can be enabled per-host or globally
- **Repository tracking**: Automatically detects APT/YUM repositories

## User Management

### Roles and Permissions

- **Admin**: Full system access
- **Manager**: Host and package management
- **Viewer**: Read-only access

### Creating Users

1. **Via Web Interface**: Admin → Users → Add User
2. **Via API**: POST `/api/v1/auth/admin/users`

## Host Management

### Adding Hosts

1. **Web Interface**: Hosts → Add Host
2. **API**: POST `/api/v1/hosts/create`

### Host Groups

Organize hosts into groups for better management:
- Create groups in Host Groups section
- Assign hosts to groups
- View group-specific statistics

## Monitoring and Alerts

### Dashboard

- **Overview**: Total hosts, packages, updates needed
- **Host Status**: Online/offline status
- **Update Statistics**: Security updates, regular updates
- **Recent Activity**: Latest host updates

### Package Management

- **Package List**: All packages across all hosts
- **Update Status**: Which packages need updates
- **Security Updates**: Critical security patches
- **Host Dependencies**: Which hosts use specific packages

## Security Features

### Authentication

- **JWT Tokens**: Secure session management
- **API Credentials**: Per-host authentication
- **Password Hashing**: bcrypt with salt rounds

### Security Headers

- **Helmet.js**: Security headers (CSP, HSTS, etc.)
- **CORS**: Configurable origin restrictions
- **Rate Limiting**: Per-route rate limits
- **Input Validation**: express-validator on all endpoints

### Agent Security

- **HTTPS Only**: Agents use HTTPS for communication
- **API Key Rotation**: Regenerate credentials when needed
- **Secure Storage**: Credentials stored in protected files

## Troubleshooting

### Common Issues

**Agent Connection Failed:**
```bash
# Check agent configuration
sudo /usr/local/bin/patchmon-agent.sh test

# Verify API credentials
sudo /usr/local/bin/patchmon-agent.sh ping
```

**Database Connection Issues:**
```bash
# Test database connection
cd backend
npx prisma db push

# Check migration status
npx prisma migrate status
```

**Frontend Build Issues:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build:frontend
```

### Logs

**Backend Logs:**
- Enable logging: `ENABLE_LOGGING=true`
- Log files: `backend/logs/`

**Agent Logs:**
- Log file: `/var/log/patchmon-agent.log`
- Debug mode: `sudo /usr/local/bin/patchmon-agent.sh diagnostics`

## Development

### Project Structure

```
patchmon/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Authentication, validation
│   │   └── server.js       # Main server file
│   ├── prisma/            # Database schema and migrations
│   └── package.json
├── frontend/               # React.js web application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── contexts/       # React contexts
│   │   └── utils/          # Utility functions
│   └── package.json
├── agents/                 # Agent scripts
│   └── patchmon-agent.sh   # Main agent script
└── README.md
```

### API Documentation

**Authentication:**
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user

**Hosts:**
- `GET /api/v1/hosts` - List hosts
- `POST /api/v1/hosts/create` - Create host
- `POST /api/v1/hosts/update` - Agent update (API credentials)
- `DELETE /api/v1/hosts/:id` - Delete host

**Packages:**
- `GET /api/v1/packages` - List packages
- `GET /api/v1/packages/:id` - Get package details
- `GET /api/v1/packages/search/:query` - Search packages

## Production Deployment

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name your-patchmon.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Frontend
    location / {
        root /path/to/patchmon/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Systemd Service

Create `/etc/systemd/system/patchmon.service`:

```ini
[Unit]
Description=PatchMon Backend
After=network.target

[Service]
Type=simple
User=patchmon
WorkingDirectory=/path/to/patchmon/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable patchmon
sudo systemctl start patchmon
```

## License

[Add your license information here]

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review agent logs for connection issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: Remember to change default passwords and secrets before deploying to production!
