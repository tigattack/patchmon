#!/bin/bash
# PatchMon Unified Management Script
# Usage: ./manage-patchmon.sh <command> <fqdn> [github-repo]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
FQDN=""
GITHUB_REPO=""
DB_SAFE_NAME=""
DB_NAME=""
DB_USER=""
DB_PASS=""
JWT_SECRET=""
BACKEND_PORT=""
APP_DIR=""
SERVICE_NAME=""
USE_LETSENCRYPT="false"
SERVER_PROTOCOL_SEL="http"
SERVER_PORT_SEL=80

# Functions
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Check if system component is already installed
check_system_component() {
    local component=$1
    case $component in
        "postgresql")
            systemctl is-active postgresql >/dev/null 2>&1 && return 0 || return 1
            ;;
        "nginx")
            systemctl is-active nginx >/dev/null 2>&1 && return 0 || return 1
            ;;
        "nodejs")
            command -v node >/dev/null 2>&1 && return 0 || return 1
            ;;
        "certbot")
            command -v certbot >/dev/null 2>&1 && return 0 || return 1
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to find available port
find_available_port() {
    local start_port=3001
    local port=$start_port
    
    while true; do
        # Check if port is in use using multiple methods for reliability
        if ! netstat -tuln 2>/dev/null | grep -q ":$port " && \
           ! ss -tuln 2>/dev/null | grep -q ":$port " && \
           ! lsof -i :$port 2>/dev/null | grep -q ":$port"; then
            echo $port
            return 0
        fi
        port=$((port + 1))
        
        # Safety check to prevent infinite loop
        if [ $port -gt 3100 ]; then
            print_error "Could not find available port between 3001-3100"
            exit 1
        fi
    done
}

# Initialize instance variables
init_instance_vars() {
    DB_SAFE_NAME=$(echo $FQDN | tr '[:upper:]' '[:lower:]' | tr '.-' '__')
    DB_NAME="patchmon_${DB_SAFE_NAME}"
    DB_USER="patchmon_${DB_SAFE_NAME}_user"
    DB_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    # Show currently used ports for debugging
    echo -e "${BLUE}🔍 Checking currently used ports...${NC}"
    echo "Ports 3000-3010 in use:"
    for p in {3000..3010}; do
        if netstat -tuln 2>/dev/null | grep -q ":$p " || \
           ss -tuln 2>/dev/null | grep -q ":$p " || \
           lsof -i :$p 2>/dev/null | grep -q ":$p"; then
            echo "  Port $p: IN USE"
        fi
    done
    
    BACKEND_PORT=$(find_available_port)
    FRONTEND_PORT=$((BACKEND_PORT + 1))
    APP_DIR="/opt/patchmon-$FQDN"
    SERVICE_NAME="patchmon-$FQDN"
}

# Ask whether to enable Let's Encrypt / HTTPS
choose_ssl_option() {
    echo -e "${BLUE}🔒 SSL/HTTPS Configuration${NC}"
    echo "This installer can configure Let's Encrypt for HTTPS (public FQDN required)."
    echo "If you plan to run PatchMon internally (behind NAT) or without public DNS, choose 'N'."
    read -p "Enable Let's Encrypt HTTPS? (Y/n): " ENABLE_SSL
    ENABLE_SSL=${ENABLE_SSL:-Y}
    if [[ "$ENABLE_SSL" =~ ^[Yy]$ ]]; then
        USE_LETSENCRYPT="true"
        SERVER_PROTOCOL_SEL="https"
        SERVER_PORT_SEL=443
    else
        USE_LETSENCRYPT="false"
        SERVER_PROTOCOL_SEL="http"
        SERVER_PORT_SEL=80
    fi
    export USE_LETSENCRYPT SERVER_PROTOCOL_SEL SERVER_PORT_SEL
    print_status "SSL option selected: ${USE_LETSENCRYPT} (protocol=${SERVER_PROTOCOL_SEL}, port=${SERVER_PORT_SEL})"
}

# Configure timezone and time sync
configure_timezone() {
    echo -e "${BLUE}🕒 Checking current time and timezone...${NC}"
    echo "Current time: $(date)"
    echo "Current timezone: $(timedatectl show -p Timezone --value 2>/dev/null || echo 'unknown')"
    echo
    read -p "Would you like to change the timezone? (y/N): " change_tz
    change_tz=${change_tz:-N}
    if [[ "$change_tz" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🌍 Available timezones example: Europe/London, UTC, America/New_York${NC}"
        read -p "Enter timezone (e.g., Europe/London): " NEW_TZ
        if [ ! -z "$NEW_TZ" ]; then
            timedatectl set-timezone "$NEW_TZ" || print_warning "Failed to set timezone"
            print_status "Timezone set to: $NEW_TZ"
        fi
    fi
    
    # Enable NTP sync
    if ! timedatectl show | grep -q "NTPSynchronized=yes"; then
        echo -e "${BLUE}🕐 Enabling NTP time synchronization...${NC}"
        timedatectl set-ntp true || print_warning "Failed to enable NTP"
        print_status "NTP synchronization enabled"
    else
        print_info "NTP synchronization already enabled"
    fi
}

# Update system (only if not recently updated)
update_system() {
    if [ ! -f /var/cache/apt/pkgcache.bin ] || [ $(find /var/cache/apt/pkgcache.bin -mtime +1) ]; then
        echo -e "${BLUE}📦 Updating system packages...${NC}"
        apt-get update
        apt-get upgrade -y
        print_status "System updated"
    else
        print_info "System packages recently updated, skipping"
    fi
    
    # Install essential tools if not present
    if ! command -v curl >/dev/null 2>&1 || ! command -v nc >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
        echo -e "${BLUE}📦 Installing essential tools...${NC}"
        apt-get install -y curl netcat-openbsd git
        print_status "Essential tools installed"
    fi
}

# Install Node.js (if not already installed)
install_nodejs() {
    # Force PATH refresh to ensure we get the latest Node.js
    export PATH="/usr/bin:/usr/local/bin:$PATH"
    hash -r  # Clear bash command cache
    
    NODE_VERSION=""
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        NODE_MINOR=$(echo $NODE_VERSION | cut -d'.' -f2)
        
        echo -e "${BLUE}🔍 Detected Node.js version: $NODE_VERSION${NC}"
        
        # Check if Node.js version is sufficient (need 20.19+ or 22.12+)
        if [ "$NODE_MAJOR" -gt 22 ] || [ "$NODE_MAJOR" -eq 22 ] || ([ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -ge 19 ]); then
            print_info "Node.js $NODE_VERSION is compatible (need 20.19+ or 22.12+)"
            
            # Check if npm is available
            if ! command -v npm >/dev/null 2>&1; then
                echo -e "${BLUE}📦 Installing npm...${NC}"
                apt-get install -y npm
            fi
            
            # Update npm to compatible version
            echo -e "${BLUE}🔧 Ensuring npm compatibility...${NC}"
            if [ "$NODE_MAJOR" -ge 22 ]; then
                npm install -g npm@latest
            else
                npm install -g npm@10
            fi
            
            print_status "Node.js and npm ready"
            return
        else
            print_warning "Node.js $NODE_VERSION is too old (need 20.19+ or 22.12+), upgrading..."
        fi
    else
        echo -e "${BLUE}📦 Node.js not found, installing...${NC}"
    fi
    
    echo -e "${BLUE}📦 Installing Node.js 20...${NC}"
    
    # Remove old Node.js if present
    if command -v node >/dev/null 2>&1; then
        echo -e "${YELLOW}🗑️ Removing old Node.js installation...${NC}"
        apt-get remove -y nodejs npm || true
        apt-get autoremove -y || true
        # Clear alternatives
        update-alternatives --remove-all node 2>/dev/null || true
        update-alternatives --remove-all npm 2>/dev/null || true
    fi
    
    # Clean up old NodeSource repo if present
    rm -f /etc/apt/sources.list.d/nodesource.list
    rm -f /usr/share/keyrings/nodesource.gpg
    
    # Install Node.js 20 from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Force PATH refresh again
    export PATH="/usr/bin:/usr/local/bin:$PATH"
    hash -r
    
    # Verify installation
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js installation failed - command not found"
        exit 1
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm installation failed - command not found"
        exit 1
    fi
    
    # Update npm to compatible version for Node.js 20
    echo -e "${BLUE}🔧 Updating npm to compatible version...${NC}"
    npm install -g npm@10
    
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    # Verify version is now correct
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        print_error "Node.js upgrade failed - still showing version $NODE_VERSION"
        exit 1
    fi
    
    print_status "Node.js $NODE_VERSION and npm $NPM_VERSION installed and verified"
}

# Install PostgreSQL (if not already installed)
install_postgresql() {
    if check_system_component "postgresql"; then
        print_info "PostgreSQL already installed and running"
        return
    fi
    
    echo -e "${BLUE}🗄️ Installing PostgreSQL...${NC}"
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
    print_status "PostgreSQL installed and started"
}

# Install Nginx (if not already installed)
install_nginx() {
    if check_system_component "nginx"; then
        print_info "Nginx already installed and running"
        return
    fi
    
    echo -e "${BLUE}🌐 Installing Nginx...${NC}"
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    
    # Configure firewall if ufw is available
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 'Nginx Full' || true
    fi
    
    print_status "Nginx installed and started"
}

# Install Certbot (if SSL is enabled and not already installed)
install_certbot() {
    if [ "$USE_LETSENCRYPT" != "true" ]; then
        return
    fi
    
    if check_system_component "certbot"; then
        print_info "Certbot already installed"
        return
    fi
    
    echo -e "${BLUE}🔒 Installing Certbot...${NC}"
    apt-get install -y certbot python3-certbot-nginx
    print_status "Certbot installed"
}

# Setup database for instance
setup_database() {
    echo -e "${BLUE}📋 Creating database: $DB_NAME${NC}"
    
    # Drop and recreate database and user for clean state
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" || true
    sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" || true
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    
    # Grant comprehensive permissions
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"
    
    # Set schema permissions
    sudo -u postgres psql -d $DB_NAME -c "GRANT USAGE ON SCHEMA public TO $DB_USER;"
    sudo -u postgres psql -d $DB_NAME -c "GRANT CREATE ON SCHEMA public TO $DB_USER;"
    sudo -u postgres psql -d $DB_NAME -c "ALTER SCHEMA public OWNER TO $DB_USER;"
    sudo -u postgres psql -d $DB_NAME -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;"
    sudo -u postgres psql -d $DB_NAME -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;"
    
    # Test database connection
    echo -e "${BLUE}🔍 Testing database connection...${NC}"
    if PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_status "Database connection successful"
    else
        print_error "Database connection failed"
        echo "Debug information:"
        sudo -u postgres psql -c "\l" | grep "$DB_NAME" || echo "Database not found"
        sudo -u postgres psql -c "\du" | grep "$DB_USER" || echo "User not found"
        exit 1
    fi
    
    print_status "Database $DB_NAME and user $DB_USER created and tested"
}

# Clone application code
clone_application() {
    echo -e "${BLUE}📥 Cloning PatchMon application...${NC}"
    
    # Remove existing directory if it exists
    rm -rf $APP_DIR
    
    # Try SSH first, fallback to HTTPS
    SSH_REPO=$(echo $GITHUB_REPO | sed 's|https://github.com/|git@github.com:|')
    if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        print_info "GitHub SSH key detected, using SSH clone"
        if git clone $SSH_REPO $APP_DIR 2>/dev/null; then
            print_status "Repository cloned via SSH"
        else
            print_warning "SSH clone failed, trying HTTPS..."
            git clone $GITHUB_REPO $APP_DIR
        fi
    else
        git clone $GITHUB_REPO $APP_DIR
    fi
    
    cd $APP_DIR
    
    # Set initial ownership and create required directories
    echo -e "${BLUE}🔐 Setting initial ownership and creating directories...${NC}"
    chown -R www-data:www-data $APP_DIR
    
    # Create logs directory immediately to prevent permission errors
    mkdir -p $APP_DIR/backend/logs
    chown -R www-data:www-data $APP_DIR/backend/logs
    chmod 755 $APP_DIR/backend/logs
    
    print_status "Repository cloned to $APP_DIR with correct ownership"
}

# Setup Node.js environment for instance
setup_node_environment() {
    echo -e "${BLUE}📦 Setting up Node.js environment for instance...${NC}"
    
    # Force PATH refresh to ensure we get the latest Node.js
    export PATH="/usr/bin:/usr/local/bin:$PATH"
    hash -r
    
    # Verify Node.js and npm are available
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js not found after installation. PATH issue detected."
        echo "Current PATH: $PATH"
        echo "Available node binaries:"
        find /usr -name "node" 2>/dev/null || echo "No node binaries found"
        exit 1
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm not found after installation. PATH issue detected."
        echo "Current PATH: $PATH"
        echo "Available npm binaries:"
        find /usr -name "npm" 2>/dev/null || echo "No npm binaries found"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    NODE_MINOR=$(echo $NODE_VERSION | cut -d'.' -f2)
    
    # Verify Node.js version is compatible
    if [ "$NODE_MAJOR" -lt 20 ] || ([ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]); then
        print_error "Node.js version $NODE_VERSION is incompatible with Vite 7.1.5 (need 20.19+ or 22.12+)"
        echo -e "${YELLOW}This suggests the Node.js upgrade failed. Please check the installation.${NC}"
        exit 1
    fi
    
    print_status "Node.js environment ready: Node $NODE_VERSION, npm $NPM_VERSION (compatible)"
}

# Install application dependencies
install_dependencies() {
    echo -e "${BLUE}📦 Installing application dependencies...${NC}"
    
    # Root dependencies
    if [ -f "$APP_DIR/package.json" ]; then
        cd $APP_DIR
        npm install
    fi
    
    # Backend dependencies
    if [ -f "$APP_DIR/backend/package.json" ]; then
        cd $APP_DIR/backend
        npm install
    fi
    
    # Frontend dependencies
    if [ -f "$APP_DIR/frontend/package.json" ]; then
        cd $APP_DIR/frontend
        npm install
    fi
    
    print_status "Dependencies installed"
}

# Create environment files
create_env_files() {
    echo -e "${BLUE}⚙️ Creating environment files...${NC}"
    
    # Backend .env
    cat > $APP_DIR/backend/.env << EOF
NODE_ENV=production
PORT=$BACKEND_PORT
API_VERSION=v1

# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public

# Security
CORS_ORIGINS=${SERVER_PROTOCOL_SEL}://$FQDN
TRUST_PROXY=1
ENABLE_HSTS=$([ "$USE_LETSENCRYPT" = "true" ] && echo "true" || echo "false")

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=5
HOST_RATE_LIMIT_MAX=50

# Body Parsing
JSON_BODY_LIMIT=5mb

# Logging
ENABLE_LOGGING=true

# JWT Secret
JWT_SECRET=$JWT_SECRET
EOF

    # Frontend .env (NODE_ENV not needed - Vite handles this automatically)
    cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=${SERVER_PROTOCOL_SEL}://$FQDN/api/v1
VITE_FRONTEND_URL=${SERVER_PROTOCOL_SEL}://$FQDN
VITE_FRONTEND_PORT=$FRONTEND_PORT
VITE_BACKEND_PORT=$BACKEND_PORT
EOF

    print_status "Environment files created"
}

# Run database migrations
run_migrations() {
    echo -e "${BLUE}🗃️ Running database migrations...${NC}"
    cd $APP_DIR/backend
    
    # Test connection before migrations
    if ! PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Cannot connect to database before migrations"
        echo "Debug information:"
        sudo -u postgres psql -c "\l" | grep "$DB_NAME" || echo "Database not found"
        sudo -u postgres psql -c "\du" | grep "$DB_USER" || echo "User not found"
        exit 1
    fi
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate deploy
    
    print_status "Database migrations completed"
}

# Seed default roles
seed_default_roles() {
    echo -e "${BLUE}🛡️ Seeding default roles...${NC}"
    cd $APP_DIR/backend
    
    # Test connection before seeding
    if ! PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Cannot connect to database before seeding roles"
        exit 1
    fi
    
    node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedRoles() {
  try {
    // Create admin role with full permissions
    await prisma.rolePermissions.upsert({
      where: { role: 'admin' },
      update: {
        canViewDashboard: true,
        canViewHosts: true,
        canManageHosts: true,
        canViewPackages: true,
        canManagePackages: true,
        canViewUsers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSettings: true
      },
      create: {
        role: 'admin',
        canViewDashboard: true,
        canViewHosts: true,
        canManageHosts: true,
        canViewPackages: true,
        canManagePackages: true,
        canViewUsers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSettings: true
      }
    });
    
    // Create user role with read-only permissions
    await prisma.rolePermissions.upsert({
      where: { role: 'user' },
      update: {
        canViewDashboard: true,
        canViewHosts: true,
        canManageHosts: false,
        canViewPackages: true,
        canManagePackages: false,
        canViewUsers: false,
        canManageUsers: false,
        canViewReports: true,
        canExportData: false,
        canManageSettings: false
      },
      create: {
        role: 'user',
        canViewDashboard: true,
        canViewHosts: true,
        canManageHosts: false,
        canViewPackages: true,
        canManagePackages: false,
        canViewUsers: false,
        canManageUsers: false,
        canViewReports: true,
        canExportData: false,
        canManageSettings: false
      }
    });
    
    console.log('✅ Default roles seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding roles:', error.message);
    process.exit(1);
  } finally {
    await prisma.\$disconnect();
  }
}

seedRoles();
"
    
    print_status "Default roles seeded"
}

# Build frontend
build_frontend() {
    echo -e "${BLUE}🏗️ Building frontend...${NC}"
    cd $APP_DIR/frontend
    npm run build
    print_status "Frontend built successfully"
}

# Fix permissions for the application
fix_permissions() {
    echo -e "${BLUE}🔐 Setting final permissions...${NC}"
    
    # Ensure entire directory is owned by www-data
    chown -R www-data:www-data $APP_DIR
    
    # Set directory permissions (755 = rwxr-xr-x)
    find $APP_DIR -type d -exec chmod 755 {} \;
    
    # Set file permissions (644 = rw-r--r--)
    find $APP_DIR -type f -exec chmod 644 {} \;
    
    # Make scripts executable
    if [ -f "$APP_DIR/manage.sh" ]; then
        chmod +x $APP_DIR/manage.sh
    fi
    
    # Ensure logs directory exists with correct permissions
    mkdir -p $APP_DIR/backend/logs
    chown -R www-data:www-data $APP_DIR/backend/logs
    chmod 755 $APP_DIR/backend/logs
    
    # Make sure node_modules have correct permissions for npm operations
    if [ -d "$APP_DIR/node_modules" ]; then
        chown -R www-data:www-data $APP_DIR/node_modules
    fi
    if [ -d "$APP_DIR/backend/node_modules" ]; then
        chown -R www-data:www-data $APP_DIR/backend/node_modules
    fi
    if [ -d "$APP_DIR/frontend/node_modules" ]; then
        chown -R www-data:www-data $APP_DIR/frontend/node_modules
    fi
    
    print_status "Final permissions set correctly - entire directory owned by www-data"
}

# Setup Nginx configuration
setup_nginx() {
    echo -e "${BLUE}🌐 Setting up Nginx configuration...${NC}"
    
    if [ "$USE_LETSENCRYPT" = "true" ]; then
        # HTTP-only config first for Certbot challenge
        cat > /etc/nginx/sites-available/$FQDN << EOF
server {
    listen 80;
    server_name $FQDN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF
    else
        # HTTP-only configuration
        cat > /etc/nginx/sites-available/$FQDN << EOF
server {
    listen 80;
    server_name $FQDN;
    
    # Frontend
    location / {
        root $APP_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
    }
    
    # API routes
    location /api/ {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:$BACKEND_PORT/health;
        access_log off;
    }
}
EOF
    fi
    
    # Enable site
    ln -sf /etc/nginx/sites-available/$FQDN /etc/nginx/sites-enabled/$FQDN
    
    # Test configuration
    nginx -t
    nginx -s reload
    
    print_status "Nginx configuration created"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    if [ "$USE_LETSENCRYPT" != "true" ]; then
        return
    fi
    
    echo -e "${BLUE}🔒 Setting up SSL certificate...${NC}"
    certbot --nginx -d $FQDN --non-interactive --agree-tos --email admin@$FQDN --redirect
    
    # Update Nginx config with full HTTPS configuration
    cat > /etc/nginx/sites-available/$FQDN << EOF
server {
    listen 80;
    server_name $FQDN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $FQDN;
    
    ssl_certificate /etc/letsencrypt/live/$FQDN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$FQDN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    # Frontend
    location / {
        root $APP_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }
    
    # API routes
    location /api/ {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check
    location /health {
        proxy_pass http://localhost:$BACKEND_PORT/health;
        access_log off;
    }
}
EOF
    
    nginx -t
    nginx -s reload
    
    print_status "SSL certificate installed and Nginx updated"
}

# Setup systemd service
setup_service() {
    echo -e "${BLUE}🔧 Setting up systemd service...${NC}"
    
    # Create service file
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=PatchMon Backend for $FQDN
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$BACKEND_PORT
Environment=DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    # Wait a moment for service to start
    sleep 3
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_status "Service $SERVICE_NAME started successfully"
    else
        print_error "Service $SERVICE_NAME failed to start"
        systemctl status $SERVICE_NAME
        exit 1
    fi
}

# Update database settings
update_database_settings() {
    echo -e "${BLUE}⚙️ Updating database settings...${NC}"
    cd $APP_DIR/backend
    
    # Test connection before updating settings
    if ! PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Cannot connect to database before updating settings"
        exit 1
    fi
    
    node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateSettings() {
  try {
    // Check if settings record exists, create or update
    const existingSettings = await prisma.settings.findFirst();
    
    const settingsData = {
      serverUrl: '${SERVER_PROTOCOL_SEL}://$FQDN',
      serverProtocol: '${SERVER_PROTOCOL_SEL}',
      serverHost: '$FQDN',
      serverPort: $SERVER_PORT_SEL,
      frontendUrl: '${SERVER_PROTOCOL_SEL}://$FQDN',
      updateInterval: 60,
      autoUpdate: true
    };
    
    if (existingSettings) {
      // Update existing settings
      await prisma.settings.update({
        where: { id: existingSettings.id },
        data: settingsData
      });
    } else {
      // Create new settings record
      await prisma.settings.create({
        data: settingsData
      });
    }
    
    console.log('✅ Database settings updated successfully');
  } catch (error) {
    console.error('❌ Error updating settings:', error.message);
    process.exit(1);
  } finally {
    await prisma.\$disconnect();
  }
}

updateSettings();
"
    
    print_status "Database settings updated"
}

# Create agent version
create_agent_version() {
    echo -e "${BLUE}🤖 Creating agent version...${NC}"
    cd $APP_DIR/backend
    
    # Test connection before creating agent version
    if ! PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Cannot connect to database before creating agent version"
        exit 1
    fi
    
    # Copy agent script to backend directory
    if [ -f "$APP_DIR/agents/patchmon-agent.sh" ]; then
        cp "$APP_DIR/agents/patchmon-agent.sh" "$APP_DIR/backend/"
        
        node -e "
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAgentVersion() {
  try {
    const agentScript = fs.readFileSync('./patchmon-agent.sh', 'utf8');
    
    // Set all existing versions to not be current or default
    await prisma.agentVersion.updateMany({
      data: { isCurrent: false, isDefault: false }
    });
    
        // Create or update version 1.2.3
        await prisma.agentVersion.upsert({
          where: { version: '1.2.3' },
          update: {
            scriptContent: agentScript,
            isCurrent: true,
            isDefault: true,
            releaseNotes: 'Version 1.2.3 - Production Ready\\n\\nFeatures:\\n- FQDN Configuration Support\\n- Dynamic server URL configuration\\n- Better production deployment support\\n- Smart crontab update detection\\n- Fixed circular name reference errors in DEB822 repository parsing\\n- Eliminated all warning messages during repository collection\\n\\nTechnical Improvements:\\n- Agent now respects PATCHMON_SERVER environment variable\\n- Fallback to localhost:3001 for development\\n- Better integration with deployment scripts\\n- Enhanced error handling and logging\\n\\nThis version supports dynamic server URL configuration for production deployments.'
          },
          create: {
            version: '1.2.3',
            scriptContent: agentScript,
            isCurrent: true,
            isDefault: true,
            releaseNotes: 'Version 1.2.3 - Production Ready\\n\\nFeatures:\\n- FQDN Configuration Support\\n- Dynamic server URL configuration\\n- Better production deployment support\\n- Smart crontab update detection\\n- Fixed circular name reference errors in DEB822 repository parsing\\n- Eliminated all warning messages during repository collection\\n\\nTechnical Improvements:\\n- Agent now respects PATCHMON_SERVER environment variable\\n- Fallback to localhost:3001 for development\\n- Better integration with deployment scripts\\n- Enhanced error handling and logging\\n\\nThis version supports dynamic server URL configuration for production deployments.'
          }
        });
    
    console.log('✅ Agent version 1.2.3 created/updated successfully');
  } catch (error) {
    console.error('❌ Error creating agent version:', error.message);
    process.exit(1);
  } finally {
    await prisma.\$disconnect();
  }
}

createAgentVersion();
"
        
        # Clean up
        rm -f "$APP_DIR/backend/patchmon-agent.sh"
        
        print_status "Agent version created"
    else
        print_warning "Agent script not found, skipping agent version creation"
    fi
}

# Setup admin user interactively
setup_admin_user() {
    echo -e "${BLUE}👤 Setting up admin user...${NC}"
    cd $APP_DIR/backend
    
    # Wait for service to be ready and test connection
    echo -e "${BLUE}⏳ Waiting for backend service to be ready...${NC}"
    
    # First, verify the service is actually running
    if ! systemctl is-active $SERVICE_NAME >/dev/null 2>&1; then
        print_error "Service $SERVICE_NAME is not running"
        systemctl status $SERVICE_NAME
        exit 1
    fi
    
    # Wait for the health endpoint to respond
    local max_attempts=30
    local attempt=1
    local health_url="http://localhost:$BACKEND_PORT/health"
    
    while [ $attempt -le $max_attempts ]; do
        # Try multiple methods to check if service is ready
        if curl -s --connect-timeout 5 --max-time 10 "$health_url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend service is ready${NC}"
            break
        elif nc -z localhost $BACKEND_PORT 2>/dev/null; then
            # Port is open, but health endpoint might not be ready yet
            echo -e "${YELLOW}⏳ Port $BACKEND_PORT is open, waiting for health endpoint... (attempt $attempt/$max_attempts)${NC}"
        else
            echo -e "${YELLOW}⏳ Waiting for backend service on port $BACKEND_PORT... (attempt $attempt/$max_attempts)${NC}"
        fi
        
        sleep 3
        attempt=$((attempt + 1))
        
        if [ $attempt -gt $max_attempts ]; then
            print_error "Backend service failed to become ready after $max_attempts attempts"
            echo -e "${BLUE}🔍 Debugging information:${NC}"
            echo "Service status:"
            systemctl status $SERVICE_NAME --no-pager
            echo ""
            echo "Port check:"
            netstat -tuln | grep ":$BACKEND_PORT" || echo "Port $BACKEND_PORT not listening"
            echo ""
            echo "Recent logs:"
            journalctl -u $SERVICE_NAME -n 20 --no-pager
            exit 1
        fi
    done
    
    # Test database connection
    if ! PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_error "Cannot connect to database before admin setup"
        exit 1
    fi
    
    # Copy and run admin setup script
    cp $APP_DIR/setup-admin-user.js $APP_DIR/backend/
    
    echo -e "${BLUE}🔧 Creating admin user interactively...${NC}"
    echo -e "${YELLOW}Please follow the prompts to create your admin user:${NC}"
    
    # Run admin setup with FQDN environment variable
    FQDN="$FQDN" node $APP_DIR/backend/setup-admin-user.js
    
    # Clean up
    rm -f $APP_DIR/backend/setup-admin-user.js
    
    print_status "Admin user setup completed"
}

# Setup log rotation
setup_log_rotation() {
    echo -e "${BLUE}📋 Setting up log rotation...${NC}"
    
    cat > /etc/logrotate.d/$SERVICE_NAME << EOF
/var/log/$SERVICE_NAME.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    postrotate
        systemctl reload $SERVICE_NAME
    endscript
}
EOF
    
    print_status "Log rotation configured"
}

# Save credentials
save_credentials() {
    echo -e "${BLUE}💾 Saving instance credentials...${NC}"
    
    cat > $APP_DIR/credentials.txt << EOF
# PatchMon Instance Credentials for $FQDN
# Generated on: $(date)
# 
# IMPORTANT: Keep this file secure and delete it after noting the credentials

## Database Credentials
Database Name: $DB_NAME
Database User: $DB_USER
Database Password: $DB_PASS

## JWT Secret
JWT Secret: $JWT_SECRET

## Application URLs
Frontend URL: https://$FQDN
Backend API: https://$FQDN/api/v1
Backend Port: $BACKEND_PORT
Frontend Port: $FRONTEND_PORT

## Default Admin Login
Username: admin
Password: admin123
(Please change this password after first login)

## Service Management
Service Name: $SERVICE_NAME
App Directory: $APP_DIR
Management Script: $APP_DIR/manage.sh

## Database Connection String
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public
EOF
    
    chmod 600 $APP_DIR/credentials.txt
    chown www-data:www-data $APP_DIR/credentials.txt
    
    print_status "Credentials saved to $APP_DIR/credentials.txt"
}

# Create management script for instance
create_management_script() {
    echo -e "${BLUE}📝 Creating instance management script...${NC}"
    
    cat > $APP_DIR/manage.sh << EOF
#!/bin/bash
# Management script for $FQDN

case \$1 in
    "status")
        systemctl status $SERVICE_NAME
        ;;
    "start")
        systemctl start $SERVICE_NAME
        ;;
    "stop")
        systemctl stop $SERVICE_NAME
        ;;
    "restart")
        systemctl restart $SERVICE_NAME
        ;;
    "logs")
        journalctl -u $SERVICE_NAME -f
        ;;
    "update")
        cd $APP_DIR
        git pull
        npm install
        cd backend && npm install
        npx prisma migrate deploy
        cd ../frontend && npm install && npm run build
        systemctl restart $SERVICE_NAME
        ;;
    "backup")
        pg_dump -h localhost -U $DB_USER $DB_NAME > backup_\$(date +%Y%m%d_%H%M%S).sql
        echo "Database backup created"
        ;;
    "credentials")
        echo "Credentials file: $APP_DIR/credentials.txt"
        if [ -f "$APP_DIR/credentials.txt" ]; then
            echo "Credentials file exists. Use 'cat $APP_DIR/credentials.txt' to view"
        else
            echo "Credentials file not found"
        fi
        ;;
    "reset-admin")
        echo "Resetting admin password to admin123..."
        cd $APP_DIR/backend
        node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'admin' }
    });
    
    if (adminUser) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { password: hashedPassword }
      });
      console.log('✅ Admin password reset to admin123');
    } else {
      console.log('❌ No admin user found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

resetAdminPassword();
"
        ;;
    *)
        echo "Usage: \$0 {status|start|stop|restart|logs|update|backup|credentials|reset-admin}"
        echo ""
        echo "Commands:"
        echo "  status      - Show service status"
        echo "  start       - Start the service"
        echo "  stop        - Stop the service"
        echo "  restart     - Restart the service"
        echo "  logs        - Show live logs"
        echo "  update      - Update application code and restart"
        echo "  backup      - Create database backup"
        echo "  credentials - Show credentials file location"
        echo "  reset-admin - Reset admin password to admin123"
        ;;
esac
EOF
    
    chmod +x $APP_DIR/manage.sh
    
    print_status "Management script created at $APP_DIR/manage.sh"
}

# Deploy new instance
deploy_instance() {
    local fqdn=$1
    local github_repo=$2
    
    if [ $# -ne 2 ]; then
        print_error "Usage: $0 deploy <fqdn> <github-repo>"
        print_info "Example: $0 deploy customer1.patchmon.com https://github.com/yourorg/patchmon"
        exit 1
    fi
    
    # Check if instance already exists
    if [ -d "/opt/patchmon-$fqdn" ]; then
        print_error "Instance for $fqdn already exists at /opt/patchmon-$fqdn"
        print_info "Use 'update' command to update existing instance"
        exit 1
    fi
    
    FQDN=$fqdn
    GITHUB_REPO=$github_repo
    
    print_info "🚀 Deploying PatchMon instance for $FQDN"
    
    # Initialize variables
    init_instance_vars
    
    # Display generated credentials
    echo -e "${BLUE}🔐 Auto-generated credentials:${NC}"
    echo -e "${YELLOW}Database Name: $DB_NAME${NC}"
    echo -e "${YELLOW}Database User: $DB_USER${NC}"
    echo -e "${YELLOW}Database Password: $DB_PASS${NC}"
    echo -e "${YELLOW}JWT Secret: $JWT_SECRET${NC}"
    echo -e "${YELLOW}Backend Port: $BACKEND_PORT${NC}"
    echo -e "${YELLOW}Frontend Port: $FRONTEND_PORT${NC}"
    echo -e "${BLUE}📁 App directory: $APP_DIR${NC}"
    echo -e "${BLUE}🗄️ Database: $DB_NAME${NC}"
    echo -e "${BLUE}👤 Database user: $DB_USER${NC}"
    echo ""
    
    # Interactive configuration
    choose_ssl_option
    
    # Only configure timezone on first deployment
    if ! check_system_component "postgresql"; then
        configure_timezone
    fi
    
    # System setup (smart detection)
    update_system
    install_nodejs
    install_postgresql
    install_nginx
    install_certbot
    
    # Instance-specific setup
    setup_database
    clone_application
    setup_node_environment
    install_dependencies
    create_env_files
    run_migrations
    seed_default_roles
    build_frontend
    setup_nginx
    setup_ssl
    setup_service
    update_database_settings
    create_agent_version
    setup_admin_user
    setup_log_rotation
    save_credentials
    create_management_script
    fix_permissions
    
    # Final status
    echo -e "${GREEN}🎉 PatchMon deployment completed successfully!${NC}"
    echo -e "${GREEN}🌐 Frontend URL: ${SERVER_PROTOCOL_SEL}://$FQDN${NC}"
    echo -e "${GREEN}🔗 API URL: ${SERVER_PROTOCOL_SEL}://$FQDN/api/v1${NC}"
    echo -e "${GREEN}⚡ Backend Port: $BACKEND_PORT${NC}"
    echo -e "${GREEN}📁 App directory: $APP_DIR${NC}"
    echo -e "${GREEN}🔧 Management: $APP_DIR/manage.sh${NC}"
    echo -e "${GREEN}📊 Service: systemctl status $SERVICE_NAME${NC}"
    echo -e "${YELLOW}🔐 Credentials saved to: $APP_DIR/credentials.txt${NC}"
    echo -e "${YELLOW}⚠️ Please note down the credentials and delete the file for security${NC}"
    echo -e "${BLUE}📋 Next steps:${NC}"
    echo -e "${BLUE}   1. Visit ${SERVER_PROTOCOL_SEL}://$FQDN and login with your admin credentials${NC}"
    echo -e "${BLUE}   2. Use '$APP_DIR/manage.sh' for service management${NC}"
    echo -e "${BLUE}   3. Check '$APP_DIR/manage.sh credentials' for database details${NC}"
    echo -e "${BLUE}   4. Install agents using: curl -s ${SERVER_PROTOCOL_SEL}://$FQDN/api/v1/hosts/agent/download | bash${NC}"
}

# Update existing instance
update_instance() {
    local fqdn=$1
    
    if [ $# -ne 1 ]; then
        print_error "Usage: $0 update <fqdn>"
        exit 1
    fi
    
    local app_dir="/opt/patchmon-$fqdn"
    local service_name="patchmon-$fqdn"
    
    if [ ! -d "$app_dir" ]; then
        print_error "Instance for $fqdn not found at $app_dir"
        exit 1
    fi
    
    print_info "Updating PatchMon instance for $fqdn..."
    
    cd "$app_dir"
    
    # Backup database first
    print_info "Creating database backup..."
    local db_safe_name=$(echo $fqdn | tr '[:upper:]' '[:lower:]' | tr '.-' '__')
    local db_name="patchmon_${db_safe_name}"
    local db_user="patchmon_${db_safe_name}_user"
    
    pg_dump -h localhost -U "$db_user" "$db_name" > backup_$(date +%Y%m%d_%H%M%S).sql
    
    # Update code
    print_info "Pulling latest code..."
    git pull
    
    # Update dependencies
    print_info "Updating dependencies..."
    npm install
    cd backend && npm install
    cd ../frontend && npm install
    
    # Run migrations
    print_info "Running database migrations..."
    cd ../backend
    npx prisma migrate deploy
    
    # Rebuild frontend
    print_info "Rebuilding frontend..."
    cd ../frontend
    npm run build
    
    # Restart service
    print_info "Restarting service..."
    systemctl restart "$service_name"
    
    print_status "Instance updated successfully"
}

# Delete instance
delete_instance() {
    local fqdn=$1
    
    if [ $# -ne 1 ]; then
        print_error "Usage: $0 delete <fqdn>"
        exit 1
    fi
    
    local db_safe_name=$(echo $fqdn | tr '[:upper:]' '[:lower:]' | tr '.-' '__')
    local db_name="patchmon_${db_safe_name}"
    local db_user="patchmon_${db_safe_name}_user"
    local app_dir="/opt/patchmon-$fqdn"
    local service_name="patchmon-$fqdn"
    
    if [ ! -d "$app_dir" ]; then
        print_error "Instance for $fqdn not found at $app_dir"
        exit 1
    fi
    
    print_warning "This will permanently delete the PatchMon instance for $fqdn"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Deletion cancelled"
        exit 0
    fi
    
    print_info "Deleting PatchMon instance for $fqdn..."
    
    # Stop and disable service
    systemctl stop "$service_name" || true
    systemctl disable "$service_name" || true
    
    # Remove service file
    rm -f "/etc/systemd/system/$service_name.service"
    systemctl daemon-reload
    
    # Remove application directory
    rm -rf "$app_dir"
    
    # Remove database
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $db_name;" || true
    sudo -u postgres psql -c "DROP USER IF EXISTS $db_user;" || true
    
    # Remove Nginx configuration
    rm -f "/etc/nginx/sites-enabled/$fqdn"
    rm -f "/etc/nginx/sites-available/$fqdn"
    nginx -s reload
    
    # Remove SSL certificate
    certbot delete --cert-name "$fqdn" --non-interactive || true
    
    print_status "Instance deleted successfully"
}

# List all instances
list_instances() {
    print_info "Listing all PatchMon instances..."
    echo ""
    
    # Header
    printf "${BLUE}%-30s %-10s %-15s %-10s %-15s${NC}\n" "FQDN" "Status" "Backend Port" "SSL" "Service Name"
    printf "${BLUE}%-30s %-10s %-15s %-10s %-15s${NC}\n" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')"
    
    # Collect instance data
    declare -A instances
    
    # Parse systemd services
    for service in /etc/systemd/system/patchmon-*.service; do
        if [ -f "$service" ]; then
            service_name=$(basename "$service" .service)
            fqdn=$(grep "Description" "$service" | sed 's/.*for //' | head -1)
            status=$(systemctl is-active "$service_name" 2>/dev/null || echo "inactive")
            port=$(grep "Environment=PORT=" "$service" | cut -d'=' -f3 | head -1)
            
            # Check if SSL is enabled by looking for SSL certificate
            ssl="HTTP"
            if [ -d "/etc/letsencrypt/live/$fqdn" ] || grep -q "ssl_certificate" "/etc/nginx/sites-available/$fqdn" 2>/dev/null; then
                ssl="HTTPS"
            fi
            
            # Handle missing port (try alternative method for older services)
            if [ -z "$port" ]; then
                port=$(grep "PORT=" "$service" | cut -d'=' -f2 | head -1)
            fi
            if [ -z "$port" ]; then
                port="N/A"
            fi
            
            # Color code status (using printf for proper color rendering)
            if [ "$status" = "active" ]; then
                status_display="$(printf "${GREEN}%-10s${NC}" "$status")"
            else
                status_display="$(printf "${RED}%-10s${NC}" "$status")"
            fi
            
            # Color code SSL (using printf for proper color rendering)
            if [ "$ssl" = "HTTPS" ]; then
                ssl_display="$(printf "${GREEN}%-10s${NC}" "$ssl")"
            else
                ssl_display="$(printf "${YELLOW}%-10s${NC}" "$ssl")"
            fi
            
            printf "%-30s %s %-15s %s %-15s\n" "$fqdn" "$status_display" "$port" "$ssl_display" "$service_name"
        fi
    done
    
    echo ""
    print_info "Management Commands:"
    echo "  ./manage-patchmon.sh status <fqdn>    - Show detailed status"
    echo "  ./manage-patchmon.sh update <fqdn>    - Update instance"
    echo "  ./manage-patchmon.sh delete <fqdn>    - Delete instance"
    echo ""
    print_info "Instance Management:"
    echo "  cd /opt/patchmon-<fqdn>/ && ./manage.sh status    - Local management"
    echo "  systemctl status patchmon-<fqdn>                  - Service status"
    echo "  journalctl -u patchmon-<fqdn> -f                  - Live logs"
}

# Show instance status
show_status() {
    local fqdn=$1
    
    if [ $# -ne 1 ]; then
        print_error "Usage: $0 status <fqdn>"
        exit 1
    fi
    
    local app_dir="/opt/patchmon-$fqdn"
    local service_name="patchmon-$fqdn"
    
    if [ ! -d "$app_dir" ]; then
        print_error "Instance for $fqdn not found"
        exit 1
    fi
    
    print_info "Status for $fqdn:"
    
    echo -e "${BLUE}Service Status:${NC}"
    systemctl status "$service_name" --no-pager
    
    echo -e "\n${BLUE}Recent Logs:${NC}"
    journalctl -u "$service_name" --no-pager -n 20
    
    echo -e "\n${BLUE}Disk Usage:${NC}"
    du -sh "$app_dir"
    
    echo -e "\n${BLUE}Database Size:${NC}"
    local db_safe_name=$(echo $fqdn | tr '[:upper:]' '[:lower:]' | tr '.-' '__')
    local db_name="patchmon_${db_safe_name}"
    sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('$db_name'));"
}

# Show help
show_help() {
    echo -e "${BLUE}PatchMon Unified Management System${NC}"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  deploy <fqdn> <github-repo>"
    echo "    Deploy a new PatchMon instance with smart system detection"
    echo "    - Auto-generates all credentials"
    echo "    - Detects existing components (PostgreSQL, Nginx, Node.js)"
    echo "    - Assigns unique ports automatically"
    echo "    - Creates isolated Python virtual environments"
    echo ""
    echo "  update <fqdn>"
    echo "    Update an existing instance with latest code"
    echo ""
    echo "  delete <fqdn>"
    echo "    Delete an instance completely"
    echo ""
    echo "  list"
    echo "    List all instances with ports and status"
    echo ""
    echo "  status <fqdn>"
    echo "    Show detailed status of a specific instance"
    echo ""
    echo "Examples:"
    echo "  $0 deploy customer1.patchmon.com https://github.com/yourorg/patchmon"
    echo "  $0 deploy internal.company.com https://github.com/yourorg/patchmon"
    echo "  $0 update customer1.patchmon.com"
    echo "  $0 list"
    echo "  $0 status customer1.patchmon.com"
    echo ""
    echo "Features:"
    echo "  ✅ Smart component detection (skips already installed)"
    echo "  ✅ Automatic port allocation (prevents conflicts)"
    echo "  ✅ Isolated Node.js environments per instance"
    echo "  ✅ FQDN-based database and folder naming"
    echo "  ✅ Interactive SSL setup (Let's Encrypt or HTTP)"
    echo "  ✅ Complete instance isolation"
    echo "  ✅ Automatic credential generation"
}

# Main execution
case $1 in
    "deploy")
        shift
        deploy_instance "$@"
        ;;
    "update")
        update_instance "$2"
        ;;
    "delete")
        delete_instance "$2"
        ;;
    "list")
        list_instances
        ;;
    "status")
        show_status "$2"
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
