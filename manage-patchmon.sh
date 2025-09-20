#!/bin/bash
# PatchMon Unified Management Script
# Usage: ./manage-patchmon.sh <command> [options]
# Commands: deploy, update, delete, list, status
# Options: public-repo (for deploy command)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
SCRIPT_VERSION="manage-patchmon.sh v1.2.4-ops-2025-09-18-4"
DEFAULT_GITHUB_REPO="git@github.com:9technologygroup/patchmon.net.git"
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
PUBLIC_REPO_MODE="false"
SETUP_NGINX="true"

# Functions
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Unified version detection function
get_instance_version() {
    local app_dir=$1
    local fqdn=$2
    local status=$3
    local port=$4
    local version="N/A"
    
    # Priority 1: Get version from git tags (most accurate for deployed versions)
    if [ -d "$app_dir/.git" ]; then
        cd "$app_dir" 2>/dev/null && {
            # Try different git tag methods
            version=$(git describe --tags --exact-match HEAD 2>/dev/null | sed 's/^v//' || \
                     git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || \
                     git tag --sort=-version:refname | head -1 | sed 's/^v//' 2>/dev/null || \
                     echo "")
        } && cd - >/dev/null
    fi
    
    # Priority 2: Get version from database agent version (if service is running)
    if [ "$version" = "N/A" ] || [ -z "$version" ]; then
        if [ "$status" = "active" ] && [ -n "$port" ] && [ "$port" != "N/A" ]; then
            # Try to get version from the API
            version=$(curl -s --connect-timeout 3 "http://localhost:$port/api/v1/hosts/agent/version" 2>/dev/null | \
                     grep -o '"currentVersion":"[^"]*' | cut -d'"' -f4 2>/dev/null || echo "")
        fi
    fi
    
    # Priority 3: Get version from package.json (fallback)
    if [ "$version" = "N/A" ] || [ -z "$version" ]; then
        if [ -f "$app_dir/package.json" ]; then
            version=$(grep '"version"' "$app_dir/package.json" | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
        elif [ -f "$app_dir/backend/package.json" ]; then
            version=$(grep '"version"' "$app_dir/backend/package.json" | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
        fi
    fi
    
    # Ensure version is not empty
    if [ -z "$version" ] || [ "$version" = '""' ] || [ "$version" = "N/A" ]; then
        version="N/A"
    fi
    
    echo "$version"
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

print_banner() {
    echo -e "${BLUE}================ PatchMon Manager =================${NC}"
    echo -e "${BLUE}Running: ${SCRIPT_VERSION}${NC}"
    echo -e "${BLUE}====================================================${NC}"
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
    if ! command -v curl >/dev/null 2>&1 || ! command -v nc >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
        echo -e "${BLUE}📦 Installing essential tools...${NC}"
        apt-get install -y curl netcat-openbsd git jq
        print_status "Essential tools installed (curl, netcat, git, jq)"
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
    
    if [ "$PUBLIC_REPO_MODE" = "true" ]; then
        # Public repo mode - use HTTPS clone directly
        print_info "Public repository mode - using HTTPS clone"
        # Convert SSH URL to HTTPS if needed
        HTTPS_REPO=$(echo $GITHUB_REPO | sed 's|git@github.com:|https://github.com/|' | sed 's|\.git$|.git|')
        git clone -b "$DEPLOYMENT_BRANCH" $HTTPS_REPO $APP_DIR
        print_status "Repository cloned via HTTPS (public repo mode) from branch: $DEPLOYMENT_BRANCH"
    else
        # Original behavior - Try SSH first, fallback to HTTPS
        SSH_REPO=$(echo $GITHUB_REPO | sed 's|https://github.com/|git@github.com:|')
        if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
            print_info "GitHub SSH key detected, using SSH clone"
            if git clone -b "$DEPLOYMENT_BRANCH" $SSH_REPO $APP_DIR 2>/dev/null; then
                print_status "Repository cloned via SSH from branch: $DEPLOYMENT_BRANCH"
            else
                print_warning "SSH clone failed, trying HTTPS..."
                git clone -b "$DEPLOYMENT_BRANCH" $GITHUB_REPO $APP_DIR
            fi
        else
            git clone -b "$DEPLOYMENT_BRANCH" $GITHUB_REPO $APP_DIR
        fi
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
    
    # Copy frontend server.js if nginx is disabled
    if [ "$SETUP_NGINX" = "false" ]; then
        echo -e "${BLUE}📁 Copying frontend server.js...${NC}"
        cp $SCRIPT_DIR/frontend/server.js $APP_DIR/frontend/
        print_status "Frontend server.js copied"
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
    if [ "$SETUP_NGINX" = "true" ]; then
        # With nginx - use FQDN
        cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=${SERVER_PROTOCOL_SEL}://$FQDN/api/v1
VITE_FRONTEND_URL=${SERVER_PROTOCOL_SEL}://$FQDN
VITE_FRONTEND_PORT=$FRONTEND_PORT
VITE_BACKEND_PORT=$BACKEND_PORT
EOF
    else
        # Without nginx - use separate frontend and backend ports
        cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=${SERVER_PROTOCOL_SEL}://$FQDN/api/v1
VITE_FRONTEND_URL=${SERVER_PROTOCOL_SEL}://$FQDN
VITE_FRONTEND_PORT=$FRONTEND_PORT
VITE_BACKEND_PORT=$BACKEND_PORT
EOF
    fi

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
    
    # Try to get SSL certificate
    if ! certbot --nginx -d $FQDN --non-interactive --agree-tos --email admin@$FQDN --redirect; then
        print_error "SSL certificate generation failed"
        print_warning "This could be due to:"
        print_warning "  - Domain not pointing to this server"
        print_warning "  - Firewall blocking port 80/443"
        print_warning "  - DNS propagation issues"
        print_warning "  - Server not accessible from internet"
        return 1
    fi
    
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
    return 0
}

# Setup systemd service
setup_service() {
    echo -e "${BLUE}🔧 Setting up systemd service...${NC}"
    
    # Create backend service file
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
        print_status "Backend service $SERVICE_NAME started successfully"
    else
        print_error "Backend service $SERVICE_NAME failed to start"
        systemctl status $SERVICE_NAME
        exit 1
    fi
    
    # Create frontend service if nginx is disabled
    if [ "$SETUP_NGINX" = "false" ]; then
        echo -e "${BLUE}🔧 Setting up frontend service...${NC}"
        
        # Create frontend service file
        cat > /etc/systemd/system/${SERVICE_NAME}-frontend.service << EOF
[Unit]
Description=PatchMon Frontend for $FQDN
After=network.target
Wants=$SERVICE_NAME.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$APP_DIR/frontend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$FRONTEND_PORT
Environment=CORS_ORIGIN=${SERVER_PROTOCOL_SEL}://$FQDN

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
SyslogIdentifier=${SERVICE_NAME}-frontend

[Install]
WantedBy=multi-user.target
EOF

        # Reload systemd and enable frontend service
        systemctl daemon-reload
        systemctl enable ${SERVICE_NAME}-frontend
        systemctl start ${SERVICE_NAME}-frontend
        
        # Wait a moment for service to start
        sleep 3
        
        if systemctl is-active --quiet ${SERVICE_NAME}-frontend; then
            print_status "Frontend service ${SERVICE_NAME}-frontend started successfully"
        else
            print_error "Frontend service ${SERVICE_NAME}-frontend failed to start"
            systemctl status ${SERVICE_NAME}-frontend
            exit 1
        fi
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
    
    # Priority 1: Get version from agent script (most accurate for agent versions)
    local current_version="N/A"
    if [ -f "$APP_DIR/agents/patchmon-agent.sh" ]; then
        current_version=$(grep '^AGENT_VERSION=' "$APP_DIR/agents/patchmon-agent.sh" | cut -d'"' -f2 2>/dev/null || echo "N/A")
        if [ "$current_version" != "N/A" ] && [ -n "$current_version" ]; then
            print_info "Detected agent version from script: $current_version"
        fi
    fi
    
    # Priority 2: Get version from the codebase (if agent script version not found)
    if [ "$current_version" = "N/A" ] || [ -z "$current_version" ]; then
        current_version=$(get_instance_version "$APP_DIR" "" "" "")
        if [ "$current_version" != "N/A" ] && [ -n "$current_version" ]; then
            print_info "Detected version from codebase: $current_version"
        fi
    fi
    
    # Priority 3: Fallback to package.json version
    if [ "$current_version" = "N/A" ] || [ -z "$current_version" ]; then
        if [ -f "package.json" ]; then
            current_version=$(grep '"version"' "package.json" | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
            if [ -n "$current_version" ]; then
                print_info "Detected version from package.json: $current_version"
            fi
        fi
    fi
    
    # Check if we're updating an existing instance - if so, check what version is currently in the database
    if [ "$current_version" = "N/A" ] || [ -z "$current_version" ]; then
        print_info "Checking existing agent versions in database..."
        local db_version=$(node -e "
            require('dotenv').config();
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            
            prisma.agentVersion.findFirst({
                where: { isCurrent: true },
                select: { version: true }
            }).then(version => {
                if (version) {
                    console.log(version.version);
                } else {
                    console.log('N/A');
                }
                prisma.\$disconnect();
            }).catch(() => {
                console.log('N/A');
                prisma.\$disconnect();
            });
        " 2>/dev/null || echo "N/A")
        
        if [ "$db_version" != "N/A" ] && [ -n "$db_version" ]; then
            current_version="$db_version"
            print_info "Using existing database version: $current_version"
        else
            # Final fallback to 1.2.5 if still not found
            current_version="1.2.5"
            print_warning "Could not determine version, using fallback: $current_version"
        fi
    fi
    
    print_info "Creating/updating agent version: $current_version"
    print_info "This will ensure the latest agent script is available in the database"
    
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
require('dotenv').config({ path: './.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const currentVersion = '$current_version';

// Simple version comparison function
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  return 0;
}

async function createAgentVersion() {
  try {
    const agentScript = fs.readFileSync('./patchmon-agent.sh', 'utf8');
    
    // Check if current version already exists
    const existingVersion = await prisma.agentVersion.findUnique({
      where: { version: currentVersion }
    });
    
    if (existingVersion) {
      // Version exists, always update the script content during updates
      console.log('📝 Updating existing agent version ' + currentVersion + ' with latest script content...');
      await prisma.agentVersion.update({
        where: { version: currentVersion },
        data: {
          scriptContent: agentScript,
          isCurrent: true,
          releaseNotes: 'Version ' + currentVersion + ' - Updated Agent Script\\n\\nThis version contains the latest agent script from the codebase update.'
        }
      });
      console.log('✅ Agent version ' + currentVersion + ' updated successfully with latest script');
    } else {
      // Version doesn't exist, create it
      console.log('🆕 Creating new agent version ' + currentVersion + '...');
      await prisma.agentVersion.create({
        data: {
          version: currentVersion,
          scriptContent: agentScript,
          isCurrent: true,
          isDefault: false, // Don't set as default during updates
          releaseNotes: 'Version ' + currentVersion + ' - Updated Agent Script\\n\\nThis version contains the latest agent script from the codebase update.'
        }
      });
      console.log('✅ Agent version ' + currentVersion + ' created successfully');
    }
    
    // Set all other versions to not be current
    await prisma.agentVersion.updateMany({
      where: { version: { not: currentVersion } },
      data: { isCurrent: false }
    });
    
    // Check if we should update older versions with the new script
    const allVersions = await prisma.agentVersion.findMany({
      orderBy: { version: 'desc' }
    });
    
    for (const version of allVersions) {
      if (version.version !== currentVersion && compareVersions(currentVersion, version.version) > 0) {
        console.log('🔄 Updating older version ' + version.version + ' with new script content...');
        await prisma.agentVersion.update({
          where: { id: version.id },
          data: {
            scriptContent: agentScript,
            releaseNotes: 'Version ' + version.version + ' - Updated with latest script from ' + currentVersion + '\\n\\nThis version has been updated with the latest agent script content.'
          }
        });
      }
    }
    
    console.log('✅ Agent version management completed successfully');
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
        git config --global --add safe.directory $APP_DIR 2>/dev/null || true
        git pull origin $DEPLOYMENT_BRANCH
        # Clean reinstall ALL dependencies (fixes workspace issues)
        echo "Clean reinstalling ALL dependencies..."
        
        # Remove root node_modules first
        echo "Removing root node_modules..."
        rm -rf node_modules package-lock.json 2>/dev/null || true
        
        # Clean reinstall root dependencies
        echo "Installing root dependencies..."
        npm install
        
        # Install backend dependencies
        echo "Installing backend dependencies..."
        cd backend && npm install
        
        if [ -f ".env" ]; then
            export \$(grep -v '^#' .env | xargs)
            
            # Debug: Check environment variables
            echo "Environment variables loaded from .env"
            echo "DATABASE_URL: \${DATABASE_URL:0:50}..." # Show first 50 chars only for security
            echo "DB_HOST: \$DB_HOST"
            echo "DB_PORT: \$DB_PORT"
            echo "DB_NAME: \$DB_NAME"
            echo "DB_USER: \$DB_USER"
            
            # Try different ways to run Prisma migrations
            # Skip npx if we know parent binary exists (npx has permission issues)
            if [ -f "../node_modules/.bin/prisma" ]; then
                chmod +x ../node_modules/.bin/prisma
                node ../node_modules/.bin/prisma migrate deploy
            elif [ -f "./node_modules/.bin/prisma" ]; then
                chmod +x ./node_modules/.bin/prisma
                node ./node_modules/.bin/prisma migrate deploy
            elif [ -f "../node_modules/prisma/build/index.js" ]; then
                node ../node_modules/prisma/build/index.js migrate deploy
            elif [ -f "./node_modules/prisma/build/index.js" ]; then
                node ./node_modules/prisma/build/index.js migrate deploy
            elif command -v npx >/dev/null 2>&1; then
                npx prisma migrate deploy
            else
                echo "Error: Prisma CLI not found. Trying to install..."
                npm install prisma @prisma/client
                npx prisma migrate deploy
            fi
        else
            echo "Error: .env file not found"
            exit 1
        fi
        # Stop service before rebuilding frontend
        echo "Stopping service before frontend rebuild..."
        systemctl stop $SERVICE_NAME 2>/dev/null || echo "Service was not running or failed to stop"
        
        # Wait a moment for service to fully stop
        echo "Waiting for service to fully stop..."
        sleep 2
        
        # Clean reinstall frontend dependencies (fixes .bin directory issues)
        echo "Clean reinstalling frontend dependencies..."
        cd ../frontend
        
        # Debug: Check if we're in the right place
        echo "Current directory: $(pwd)"
        echo "Contents of frontend directory:"
        ls -la
        
        # Check if package.json exists
        if [ ! -f "package.json" ]; then
            echo "Error: package.json not found in frontend directory!"
            exit 1
        fi
        
        echo "Found package.json, proceeding with clean install..."
        
        # Fix ownership before clean install
        echo "Fixing directory ownership..."
        chown -R root:root $(pwd) 2>/dev/null || echo "Warning: Could not change ownership"
        
        # More aggressive cleanup
        echo "Performing aggressive cleanup..."
        rm -rf node_modules package-lock.json .npm 2>/dev/null || true
        npm cache clean --force 2>/dev/null || true
        
        # Force a complete fresh install
        echo "Running fresh npm install..."
        if npm install --no-cache --force; then
            echo "npm install completed successfully"
            echo "Checking if .bin directory was created:"
            if [ -d "node_modules/.bin" ]; then
                echo ".bin directory created successfully:"
                ls -la node_modules/.bin/ | head -5
            else
                echo "Warning: Still no .bin directory after npm install"
            fi
        else
            echo "Error: npm install failed!"
            exit 1
        fi
        
        # Fix ownership back to www-data after install
        echo "Restoring www-data ownership..."
        chown -R www-data:www-data $(pwd) 2>/dev/null || echo "Warning: Could not restore www-data ownership"
        
        # Generate Prisma client after fresh install
        echo "Generating Prisma client..."
        cd ../backend
        if npx prisma generate; then
            echo "Prisma client generated successfully"
        else
            echo "Prisma generate failed, trying alternative method..."
            node ../node_modules/.bin/prisma generate || echo "Error: Prisma generate failed completely"
        fi
        
        # Fix Vite and other binary permissions
        echo "Fixing frontend binary permissions..."
        
        # Get the frontend directory path
        FRONTEND_DIR="$(pwd)"
        echo "Frontend directory: $FRONTEND_DIR"
        
        # Debug: Check what's in the .bin directory
        echo "Contents of .bin directory:"
        ls -la "$FRONTEND_DIR/node_modules/.bin/" 2>/dev/null || echo "No .bin directory found"
        
        # Fix all binaries in .bin directory with more aggressive approach
        if [ -d "$FRONTEND_DIR/node_modules/.bin" ]; then
            echo "Fixing .bin directory permissions..."
            chmod -R 755 "$FRONTEND_DIR/node_modules/.bin/"
            chmod -R +x "$FRONTEND_DIR/node_modules/.bin/"
            echo "Fixed .bin directory permissions"
        fi
        
        # Fix Vite specifically with multiple approaches
        if [ -f "$FRONTEND_DIR/node_modules/.bin/vite" ]; then
            echo "Fixing vite binary permissions..."
            chmod 755 "$FRONTEND_DIR/node_modules/.bin/vite"
            chmod +x "$FRONTEND_DIR/node_modules/.bin/vite"
            echo "Vite binary permissions: $(ls -la "$FRONTEND_DIR/node_modules/.bin/vite" 2>/dev/null || echo 'not found')"
        fi
        
        # Fix all node_modules binaries
        echo "Fixing all node_modules binary permissions..."
        find "$FRONTEND_DIR/node_modules" -name "*.js" -path "*/bin/*" -exec chmod +x {} \; 2>/dev/null || true
        find "$FRONTEND_DIR/node_modules" -name "vite*" -exec chmod +x {} \; 2>/dev/null || true
        
        # Fix Vite in node_modules/vite
        if [ -d "$FRONTEND_DIR/node_modules/vite" ]; then
            echo "Fixing vite package permissions..."
            chmod -R 755 "$FRONTEND_DIR/node_modules/vite/"
            find "$FRONTEND_DIR/node_modules/vite" -name "vite*" -exec chmod +x {} \; 2>/dev/null || true
            echo "Fixed vite directory permissions"
        fi
        
        # Also try to fix any vite binaries in the current directory
        find . -name "vite*" -exec chmod +x {} \; 2>/dev/null || true
        echo "Fixed any vite binaries in current directory"
        
        # Try npm run build first, fallback to npx if it fails
        if ! npm run build; then
            echo "npm run build failed, trying alternative methods..."
            
            # Try npx vite build
            if command -v npx >/dev/null 2>&1; then
                echo "Trying npx vite build..."
                if npx vite build; then
                    echo "npx vite build succeeded"
                else
                    echo "npx vite build failed, trying node wrapper..."
                    # Try running vite with node wrapper
                    if [ -f "./node_modules/.bin/vite" ]; then
                        echo "Trying node ./node_modules/.bin/vite build..."
                        node ./node_modules/.bin/vite build
                    elif [ -f "./node_modules/vite/bin/vite.js" ]; then
                        echo "Trying node ./node_modules/vite/bin/vite.js build..."
                        node ./node_modules/vite/bin/vite.js build
                    else
                        echo "Error: All build methods failed"
                        exit 1
                    fi
                fi
            else
                echo "Error: npx not available and npm run build failed"
                exit 1
            fi
        fi
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

# Interactive timezone setup
setup_timezone_interactive() {
    echo ""
    print_info "🌍 Timezone Configuration"
    
    # Show current timezone
    current_tz=$(timedatectl show --property=Timezone --value 2>/dev/null || echo "Unknown")
    echo -e "${YELLOW}Current system timezone: $current_tz${NC}"
    echo ""
    
    # List common timezones
    echo -e "${BLUE}Common timezones:${NC}"
    echo "1) UTC"
    echo "2) America/New_York (EST/EDT)"
    echo "3) America/Chicago (CST/CDT)"
    echo "4) America/Denver (MST/MDT)"
    echo "5) America/Los_Angeles (PST/PDT)"
    echo "6) Europe/London (GMT/BST)"
    echo "7) Europe/Paris (CET/CEST)"
    echo "8) Asia/Tokyo (JST)"
    echo "9) Asia/Shanghai (CST)"
    echo "10) Australia/Sydney (AEST/AEDT)"
    echo "11) Custom timezone"
    echo "12) Skip timezone setup"
    echo ""
    
    while true; do
        read -p "Select timezone (1-12): " tz_choice
        case $tz_choice in
            1) selected_tz="UTC"; break ;;
            2) selected_tz="America/New_York"; break ;;
            3) selected_tz="America/Chicago"; break ;;
            4) selected_tz="America/Denver"; break ;;
            5) selected_tz="America/Los_Angeles"; break ;;
            6) selected_tz="Europe/London"; break ;;
            7) selected_tz="Europe/Paris"; break ;;
            8) selected_tz="Asia/Tokyo"; break ;;
            9) selected_tz="Asia/Shanghai"; break ;;
            10) selected_tz="Australia/Sydney"; break ;;
            11)
                echo ""
                read -p "Enter custom timezone (e.g., America/New_York): " selected_tz
                if [ -n "$selected_tz" ]; then
                    # Validate timezone
                    if timedatectl list-timezones | grep -q "^$selected_tz$"; then
                        break
                    else
                        print_error "Invalid timezone. Please enter a valid timezone from the list."
                        echo "You can see all available timezones with: timedatectl list-timezones"
                        continue
                    fi
                else
                    print_error "Timezone cannot be empty."
                    continue
                fi
                ;;
            12)
                print_info "Skipping timezone setup"
                return
                ;;
            *)
                print_error "Invalid choice. Please select 1-12."
                ;;
        esac
    done
    
    # Set timezone
    if [ -n "$selected_tz" ]; then
        print_info "Setting timezone to $selected_tz..."
        if sudo timedatectl set-timezone "$selected_tz" 2>/dev/null; then
            print_status "Timezone set to $selected_tz"
        else
            print_error "Failed to set timezone. You may need to run this script with sudo or set timezone manually."
        fi
    fi
}

# Deploy new instance
deploy_instance() {
    # Set default deployment branch
    DEPLOYMENT_BRANCH="${DEPLOYMENT_BRANCH:-main}"
    
    # Interactive deployment - ask for configuration
    print_info "🚀 PatchMon Interactive Deployment"
    echo ""
    
    # Q1: What FQDN will you set?
    while true; do
        echo -e "${BLUE}Q1) What FQDN will you set?${NC}"
        echo -e "${YELLOW}   Enter the fully qualified domain name for this PatchMon instance:${NC}"
        read -p "   FQDN: " fqdn
        
        if [ -z "$fqdn" ]; then
            print_error "FQDN cannot be empty. Please enter a valid domain name."
            continue
        fi
        
        # Basic FQDN validation
        if [[ $fqdn =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
            break
        else
            print_error "Invalid FQDN format. Please enter a valid domain name (e.g., patchmon.company.com)"
        fi
    done
    
    # Q2: Which deployment branch do you want to use?
    echo ""
    echo -e "${BLUE}Q2) Which deployment branch do you want to use?${NC}"
    echo -e "${YELLOW}   1 - main (stable, production-ready)${NC}"
    echo -e "${YELLOW}   2 - dev (development, latest features)${NC}"
    while true; do
        read -p "   Choose branch (1/2): " branch_choice
        case $branch_choice in
            1 ) 
                DEPLOYMENT_BRANCH="main"
                print_info "Selected branch: main (stable)"
                break
                ;;
            2 ) 
                DEPLOYMENT_BRANCH="dev"
                print_info "Selected branch: dev (development)"
                break
                ;;
            * ) 
                print_error "Please choose 1 for main or 2 for dev"
                ;;
        esac
    done
    
    # Q3: Do you wish to setup nginx?
    echo ""
    echo -e "${BLUE}Q3) Do you wish to setup nginx?${NC}"
    echo -e "${YELLOW}   This will install and configure nginx as a reverse proxy${NC}"
    echo -e "${YELLOW}   Choose 'n' if you're using an external proxy server${NC}"
    while true; do
        read -p "   Setup nginx? (y/n): " setup_nginx
        case $setup_nginx in
            [Yy]* ) 
                SETUP_NGINX="true"
                break
                ;;
            [Nn]* ) 
                SETUP_NGINX="false"
                break
                ;;
            * ) 
                print_error "Please answer yes (y) or no (n)"
                ;;
        esac
    done
    
    # Q4: Do you wish to setup Let's Encrypt? (only if nginx is being set up)
    if [ "$SETUP_NGINX" = "true" ]; then
        echo ""
        echo -e "${BLUE}Q4) Do you wish to setup Let's Encrypt? (only for public servers with ports 80/443 open)${NC}"
        echo -e "${YELLOW}   This will automatically obtain SSL certificates for your domain${NC}"
        while true; do
            read -p "   Setup Let's Encrypt? (y/n): " setup_letsencrypt
            case $setup_letsencrypt in
                [Yy]* ) 
                    USE_LETSENCRYPT="true"
                    SERVER_PROTOCOL_SEL="https"
                    SERVER_PORT_SEL=443
                    break
                    ;;
                [Nn]* ) 
                    USE_LETSENCRYPT="false"
                    SERVER_PROTOCOL_SEL="http"
                    SERVER_PORT_SEL=80
                    break
                    ;;
                * ) 
                    print_error "Please answer yes (y) or no (n)"
                    ;;
            esac
        done
    else
        # No nginx setup, but still need to ask about protocol for CORS
        echo ""
        echo -e "${BLUE}Q4) What protocol will you use to access the application?${NC}"
        echo -e "${YELLOW}   This affects CORS settings and API configuration${NC}"
        while true; do
            read -p "   Protocol (http/https): " protocol_choice
            case $protocol_choice in
                [Hh][Tt][Tt][Pp]* ) 
                    SERVER_PROTOCOL_SEL="http"
                    break
                    ;;
                [Hh][Tt][Tt][Pp][Ss]* ) 
                    SERVER_PROTOCOL_SEL="https"
                    break
                    ;;
                * ) 
                    print_error "Please enter 'http' or 'https'"
                    ;;
            esac
        done
        USE_LETSENCRYPT="false"
        SERVER_PORT_SEL=3001
        FRONTEND_PORT=3000
        print_info "Using $SERVER_PROTOCOL_SEL - Frontend on port $FRONTEND_PORT, Backend on port $SERVER_PORT_SEL"
        print_info "External NPM should route /api/* to port $SERVER_PORT_SEL and everything else to port $FRONTEND_PORT"
    fi
    
    # Q5: Do you wish to setup time zone?
    echo ""
    echo -e "${BLUE}Q5) Do you wish to setup time zone?${NC}"
    echo -e "${YELLOW}   This will configure the system timezone for better log timestamps${NC}"
    while true; do
        read -p "   Setup timezone? (y/n): " setup_timezone
        case $setup_timezone in
            [Yy]* ) 
                setup_timezone_interactive
                break
                ;;
            [Nn]* ) 
                print_info "Skipping timezone setup"
                break
                ;;
            * ) 
                print_error "Please answer yes (y) or no (n)"
                ;;
        esac
    done
    
    # Use default repository
    local github_repo="$DEFAULT_GITHUB_REPO"
    if [ "$PUBLIC_REPO_MODE" = "true" ]; then
        # Convert SSH URL to HTTPS for public repo mode
        github_repo=$(echo "$DEFAULT_GITHUB_REPO" | sed 's|git@github.com:|https://github.com/|')
        print_info "Using default repository (HTTPS): $github_repo"
    else
        print_info "Using default repository: $github_repo"
    fi
    
    # Export configuration variables
    export USE_LETSENCRYPT SERVER_PROTOCOL_SEL SERVER_PORT_SEL DEPLOYMENT_BRANCH
    
    # Display configuration summary
    echo ""
    print_info "📋 Configuration Summary:"
    echo -e "${YELLOW}   FQDN: $fqdn${NC}"
    echo -e "${YELLOW}   Branch: $DEPLOYMENT_BRANCH${NC}"
    echo -e "${YELLOW}   Repository: $github_repo${NC}"
    echo -e "${YELLOW}   Nginx Setup: $([ "$SETUP_NGINX" = "true" ] && echo "Yes" || echo "No (Direct Backend Access)")${NC}"
    if [ "$SETUP_NGINX" = "true" ]; then
        echo -e "${YELLOW}   SSL Setup: $([ "$USE_LETSENCRYPT" = "true" ] && echo "Let's Encrypt (HTTPS)" || echo "HTTP Only")${NC}"
    else
        echo -e "${YELLOW}   Frontend Port: $FRONTEND_PORT${NC}"
        echo -e "${YELLOW}   Backend Port: $BACKEND_PORT${NC}"
        echo -e "${YELLOW}   Access URL: ${SERVER_PROTOCOL_SEL}://$FQDN (via external NPM)${NC}"
        echo -e "${YELLOW}   NPM Routing: /api/* → port $BACKEND_PORT, /* → port $FRONTEND_PORT${NC}"
    fi
    echo -e "${YELLOW}   Timezone Setup: $([ "$setup_timezone" = "y" ] && echo "Yes" || echo "Skipped")${NC}"
    echo ""
    
    # Confirm deployment
    while true; do
        read -p "Proceed with deployment? (y/n): " confirm_deploy
        case $confirm_deploy in
            [Yy]* ) break ;;
            [Nn]* ) 
                print_info "Deployment cancelled by user"
                exit 0
                ;;
            * ) 
                print_error "Please answer yes (y) or no (n)"
                ;;
        esac
    done
    
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
    
    # SSL configuration already handled in interactive questions above
    
    # Only configure timezone on first deployment
    if ! check_system_component "postgresql"; then
        configure_timezone
    fi
    
    # System setup (smart detection)
    update_system
    install_nodejs
    install_postgresql
    
    # Install nginx only if requested
    if [ "$SETUP_NGINX" = "true" ]; then
        install_nginx
        install_certbot
    else
        print_info "Skipping nginx and certbot installation"
    fi
    
    # Instance-specific setup
    setup_database
    clone_application
    setup_node_environment
    install_dependencies
    create_env_files
    run_migrations
    seed_default_roles
    build_frontend
    
    # Setup nginx only if requested
    if [ "$SETUP_NGINX" = "true" ]; then
        setup_nginx
        if setup_ssl; then
            print_status "SSL certificate installed successfully"
        else
            print_warning "SSL certificate installation failed - continuing without SSL"
            print_info "You can configure SSL later through your external NPM or manually"
            # Update configuration to reflect no SSL
            USE_LETSENCRYPT="false"
            SERVER_PROTOCOL_SEL="http"
            SERVER_PORT_SEL=80
        fi
    else
        print_info "Skipping nginx configuration - using direct backend access"
    fi
    
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

# Interactive instance selection for update
interactive_update() {
    print_info "🔍 Scanning for PatchMon instances..."
    echo ""
    
    # Collect all instances
    declare -a instances
    declare -a fqdns
    declare -a app_dirs
    declare -a service_names
    declare -a statuses
    declare -a versions
    local count=0
    
    # Parse systemd services to find instances
    for service in /etc/systemd/system/patchmon-*.service; do
        if [ -f "$service" ]; then
            local service_name=$(basename "$service" .service)
            local fqdn=$(grep "Description" "$service" | sed 's/.*for //' | head -1)
            local status=$(systemctl is-active "$service_name" 2>/dev/null || echo "inactive")
            local app_dir="/opt/patchmon-$fqdn"
            
            # Try to find the app directory (handle custom paths)
            if [ ! -d "$app_dir" ]; then
                for dir in /opt/patchmon-*; do
                    if [ -d "$dir" ] && [ -f "$dir/backend/.env" ]; then
                        if grep -q "$fqdn" "$dir/backend/.env" 2>/dev/null; then
                            app_dir="$dir"
                            break
                        fi
                    fi
                done
            fi
            
            # Get version using unified function
            local port=$(grep "Environment=PORT=" "/etc/systemd/system/$service_name.service" | cut -d'=' -f3 | head -1)
            if [ -z "$port" ]; then
                port=$(grep "PORT=" "/etc/systemd/system/$service_name.service" | cut -d'=' -f2 | head -1)
            fi
            local version=$(get_instance_version "$app_dir" "$fqdn" "$status" "$port")
            
            count=$((count + 1))
            instances+=("$count")
            fqdns+=("$fqdn")
            app_dirs+=("$app_dir")
            service_names+=("$service_name")
            statuses+=("$status")
            versions+=("$version")
        fi
    done
    
    if [ $count -eq 0 ]; then
        print_error "No PatchMon instances found"
        exit 1
    fi
    
    # Display instances
    print_info "📋 Found $count PatchMon instance(s):"
    echo ""
    printf "${BLUE}%-3s %-30s %-10s %-12s %-40s${NC}\n" "ID" "FQDN" "Status" "Version" "Path"
    printf "${BLUE}%-3s %-30s %-10s %-12s %-40s${NC}\n" "---" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 12 | tr ' ' '-')" "$(printf '%*s' 40 | tr ' ' '-')"
    
    for i in "${!instances[@]}"; do
        local status_display
        if [ "${statuses[$i]}" = "active" ]; then
            status_display="$(printf "${GREEN}%-10s${NC}" "${statuses[$i]}")"
        else
            status_display="$(printf "${RED}%-10s${NC}" "${statuses[$i]}")"
        fi
        printf "%-3s %-30s %s %-12s %-40s\n" "${instances[$i]}" "${fqdns[$i]}" "$status_display" "${versions[$i]}" "${app_dirs[$i]}"
    done
    
    echo ""
    print_info "💡 Select instances to update:"
    print_info "   • Enter single number (e.g., 1)"
    print_info "   • Enter multiple numbers separated by spaces (e.g., 1 3 5)"
    print_info "   • Enter range (e.g., 1-3)"
    print_info "   • Enter 'all' to update all instances"
    print_info "   • Enter 'q' to quit"
    echo ""
    
    read -p "Select instances to update: " selection
    
    if [ "$selection" = "q" ]; then
        print_info "Update cancelled"
        exit 0
    fi
    
    # Parse selection
    declare -a selected_indices
    
    if [ "$selection" = "all" ]; then
        for i in "${!instances[@]}"; do
            selected_indices+=("$i")
        done
    elif [[ "$selection" =~ ^[0-9]+-[0-9]+$ ]]; then
        # Handle range (e.g., 1-3)
        local start=$(echo "$selection" | cut -d'-' -f1)
        local end=$(echo "$selection" | cut -d'-' -f2)
        for ((i=start; i<=end; i++)); do
            if [ $i -le $count ]; then
                selected_indices+=("$((i-1))")
            fi
        done
    else
        # Handle individual numbers or space-separated list
        for num in $selection; do
            if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le $count ]; then
                selected_indices+=("$((num-1))")
            else
                print_error "Invalid selection: $num (must be between 1 and $count)"
                exit 1
            fi
        done
    fi
    
    if [ ${#selected_indices[@]} -eq 0 ]; then
        print_error "No valid instances selected"
        exit 1
    fi
    
    # Confirm selection
    echo ""
    print_info "📝 Selected instances for update:"
    for idx in "${selected_indices[@]}"; do
        printf "   ${GREEN}%s${NC} - %s (%s)\n" "${instances[$idx]}" "${fqdns[$idx]}" "${app_dirs[$idx]}"
    done
    
    echo ""
    read -p "Proceed with update? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Update cancelled"
        exit 0
    fi
    
    # Update selected instances
    local success_count=0
    local failed_instances=()
    
    for idx in "${selected_indices[@]}"; do
        local fqdn="${fqdns[$idx]}"
        local app_dir="${app_dirs[$idx]}"
        local service_name="${service_names[$idx]}"
        
        echo ""
        print_info "🚀 Updating instance ${instances[$idx]}: $fqdn"
        print_info "   Path: $app_dir"
        print_info "   Service: $service_name"
        echo ""
        
        if update_single_instance "$fqdn" "$app_dir" "$service_name"; then
            success_count=$((success_count + 1))
            print_status "✅ Instance ${instances[$idx]} ($fqdn) updated successfully"
        else
            failed_instances+=("${instances[$idx]} ($fqdn)")
            print_error "❌ Instance ${instances[$idx]} ($fqdn) update failed"
        fi
        
        # Add separator between instances
        if [ $idx != "${selected_indices[-1]}" ]; then
            echo ""
            echo "$(printf '%*s' 80 | tr ' ' '=')"
        fi
    done
    
    # Final summary
    echo ""
    echo "$(printf '%*s' 80 | tr ' ' '=')"
    print_info "📊 Update Summary:"
    print_status "✅ Successfully updated: $success_count/${#selected_indices[@]} instances"
    
    if [ ${#failed_instances[@]} -gt 0 ]; then
        print_error "❌ Failed instances:"
        for failed in "${failed_instances[@]}"; do
            echo "   - $failed"
        done
        exit 1
    else
        print_status "🎉 All selected instances updated successfully!"
    fi
}

# Update existing instance (refactored to support both direct and interactive calls)
update_instance() {
    local fqdn=$1
    local custom_path=$2
    
    # If no parameters provided, show interactive selection
    if [ $# -eq 0 ]; then
        interactive_update
        return
    fi
    
    if [ $# -gt 2 ]; then
        print_error "Usage: $0 update [fqdn] [custom-path]"
        print_info "Examples:"
        print_info "  $0 update                                          # Interactive mode"
        print_info "  $0 update pmon.manage.9.technology                 # Update specific instance"
        print_info "  $0 update pmon.manage.9.technology /opt/custom-path # Update with custom path"
        exit 1
    fi
    
    local app_dir
    local service_name
    
    if [ -n "$custom_path" ]; then
        # Use custom path provided by user
        app_dir="$custom_path"
        service_name=$(basename "$app_dir" | sed 's/^patchmon-/patchmon-/')
        if [[ "$service_name" != patchmon-* ]]; then
            service_name="patchmon-$(basename "$app_dir")"
        fi
        print_info "Using custom path: $app_dir"
        print_info "Detected service name: $service_name"
    else
        # Use standard path based on FQDN
        app_dir="/opt/patchmon-$fqdn"
        service_name="patchmon-$fqdn"
        
        # If standard path doesn't exist, try to find it automatically
        if [ ! -d "$app_dir" ]; then
            print_info "Standard path $app_dir not found, searching for instance..."
            
            # Look for directories that might match this instance
            local found_dirs=()
            for dir in /opt/patchmon-*; do
                if [ -d "$dir" ]; then
                    # Check if this directory contains a .env file with matching FQDN
                    if [ -f "$dir/backend/.env" ]; then
                        if grep -q "$fqdn" "$dir/backend/.env" 2>/dev/null; then
                            found_dirs+=("$dir")
                        fi
                    fi
                    # Also check if the directory name contains parts of the FQDN
                    if [[ "$dir" == *"$(echo "$fqdn" | cut -d'.' -f1)"* ]]; then
                        found_dirs+=("$dir")
                    fi
                fi
            done
            
            # Remove duplicates
            found_dirs=($(printf "%s\n" "${found_dirs[@]}" | sort -u))
            
            if [ ${#found_dirs[@]} -eq 1 ]; then
                app_dir="${found_dirs[0]}"
                service_name=$(basename "$app_dir" | sed 's/^patchmon-/patchmon-/')
                if [[ "$service_name" != patchmon-* ]]; then
                    service_name="patchmon-$(basename "$app_dir")"
                fi
                print_info "Found matching instance at: $app_dir"
                print_info "Detected service name: $service_name"
            elif [ ${#found_dirs[@]} -gt 1 ]; then
                print_error "Multiple possible instances found for $fqdn:"
                for dir in "${found_dirs[@]}"; do
                    echo "  - $dir"
                done
                print_info "Please specify the exact path:"
                print_info "  $0 update $fqdn <path>"
                exit 1
            fi
        fi
    fi
    
    if [ ! -d "$app_dir" ]; then
        print_error "Instance for $fqdn not found at $app_dir"
        print_info "Available instances:"
        for dir in /opt/patchmon-*; do
            if [ -d "$dir" ]; then
                echo "  - $dir"
            fi
        done
        print_info "Use: $0 update $fqdn <custom-path>"
        exit 1
    fi
    
    # Call the single instance update function
    update_single_instance "$fqdn" "$app_dir" "$service_name"
}

# Update single instance (core update logic)
update_single_instance() {
    local fqdn=$1
    local app_dir=$2
    local service_name=$3
    
    # Reset environment for each instance to avoid cross-contamination
    unset PATH_MODIFIED
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    
    print_info "Updating PatchMon instance for $fqdn..."
    print_info "🔍 Instance details: FQDN=$fqdn, Path=$app_dir, Service=$service_name"
    
    cd "$app_dir"
    
    # Check current branch and switch to main if needed (for main script)
    local current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    if [ "$current_branch" != "main" ]; then
        print_info "Current branch: $current_branch, switching to main branch..."
        
        # Stash any local changes before switching
        if git status --porcelain | grep -q .; then
            print_info "Stashing local changes before branch switch..."
            git stash push -m "Auto-stash before switching to main branch $(date)"
        fi
        
        # Switch to main branch
        if git checkout main 2>/dev/null; then
            print_status "Successfully switched to main branch"
        else
            # If main branch doesn't exist locally, create it from origin/main
            print_info "Creating local main branch from origin/main..."
            git fetch origin main
            git checkout -b main origin/main
            print_status "Created and switched to main branch"
        fi
    else
        print_info "Already on main branch"
    fi
    
    # Backup database first
    print_info "Creating database backup..."
    
    # Read database credentials from .env file
    if [ -f "$app_dir/backend/.env" ]; then
        local db_name=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'=' -f2 | sed 's/.*\/\([^?]*\).*/\1/')
        local db_user=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'@' -f1 | sed 's/.*:\/\/\([^:]*\).*/\1/')
        local db_pass=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'@' -f1 | sed 's/.*:\/\/[^:]*:\([^@]*\).*/\1/')
        local db_host=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'@' -f2 | cut -d'/' -f1 | cut -d':' -f1)
        local db_port=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'@' -f2 | cut -d'/' -f1 | cut -d':' -f2)
        
        # Set defaults if not found
        db_host=${db_host:-localhost}
        db_port=${db_port:-5432}
        
        if [ -n "$db_name" ] && [ -n "$db_user" ] && [ -n "$db_pass" ]; then
            PGPASSWORD="$db_pass" pg_dump -h "$db_host" -p "$db_port" -U "$db_user" "$db_name" > backup_$(date +%Y%m%d_%H%M%S).sql
            print_status "Database backup created"
        else
            print_warning "Could not read database credentials from .env file, skipping backup"
        fi
    else
        print_warning ".env file not found, skipping database backup"
    fi
    
    # Update code
    print_info "Pulling latest code..."
    
    # Fix git ownership issue if it exists
    git config --global --add safe.directory "$app_dir" 2>/dev/null || true
    
    # Check if we have the correct remote origin
    current_origin=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$current_origin" ]; then
        print_info "Current origin: $current_origin"
        
        # If current origin doesn't match default repo, offer to update it
        local expected_repo="$DEFAULT_GITHUB_REPO"
        if [ "$PUBLIC_REPO_MODE" = "true" ]; then
            # Convert SSH URL to HTTPS for public repo mode
            expected_repo=$(echo "$DEFAULT_GITHUB_REPO" | sed 's|git@github.com:|https://github.com/|')
        fi
        
        if [ "$current_origin" != "$expected_repo" ]; then
            print_warning "Current origin differs from expected repository"
            print_info "Current: $current_origin"
            print_info "Expected: $expected_repo"
            read -p "Update origin to expected repository? (y/N): " update_origin
            if [[ "$update_origin" =~ ^[Yy]$ ]]; then
                git remote set-url origin "$expected_repo"
                print_status "Updated origin to: $expected_repo"
            fi
        fi
    else
        print_warning "No origin found, setting to expected repository"
        local expected_repo="$DEFAULT_GITHUB_REPO"
        if [ "$PUBLIC_REPO_MODE" = "true" ]; then
            # Convert SSH URL to HTTPS for public repo mode
            expected_repo=$(echo "$DEFAULT_GITHUB_REPO" | sed 's|git@github.com:|https://github.com/|')
        fi
        git remote add origin "$expected_repo" 2>/dev/null || git remote set-url origin "$expected_repo"
        print_status "Set origin to: $expected_repo"
    fi
    
    # Handle potential conflicts with local changes (especially patchmon-agent.sh)
    if [ "$PUBLIC_REPO_MODE" = "true" ]; then
        # Public repo mode - ensure we're using HTTPS origin
        current_origin=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$current_origin" == git@github.com:* ]]; then
            print_info "Converting SSH origin to HTTPS for public repo mode"
            HTTPS_ORIGIN=$(echo "$current_origin" | sed 's|git@github.com:|https://github.com/|')
            git remote set-url origin "$HTTPS_ORIGIN"
            print_status "Updated origin to HTTPS: $HTTPS_ORIGIN"
        fi
    fi
    
    if ! git pull origin "$DEPLOYMENT_BRANCH"; then
        print_warning "Git pull failed, likely due to local changes. Attempting to resolve..."
        
        # Check if the conflict is with patchmon-agent.sh (common case)
        if git status --porcelain | grep -q "agents/patchmon-agent.sh"; then
            print_info "Detected conflict with patchmon-agent.sh (expected due to custom configuration)"
            print_info "Stashing local changes and retrying pull..."
            
            # Stash local changes
            git stash push -m "Auto-stash before update $(date)"
            
            # Try pull again
            if git pull origin "$DEPLOYMENT_BRANCH"; then
                print_status "Successfully pulled latest changes"
                print_info "Local changes have been stashed and can be recovered if needed"
                print_info "Note: patchmon-agent.sh will be regenerated with current instance configuration"
            else
                print_error "Git pull still failed after stashing. Manual intervention required."
                print_info "You may need to resolve conflicts manually in: $app_dir"
                return 1
            fi
        else
            # Other conflicts - let user know
            print_error "Git pull failed with conflicts. Showing status:"
            git status
            print_info "Please resolve conflicts manually in: $app_dir"
            print_info "Common solutions:"
            print_info "  1. git stash (to save local changes)"
            print_info "  2. git reset --hard origin/main (to discard local changes)"
            print_info "  3. Manually resolve conflicts and commit"
            return 1
        fi
    else
        print_status "Successfully pulled latest changes"
    fi
    
    # Note: Cleanup and installation will be handled by the 3-step process below
    print_info "Proceeding to 3-step dependency management process..."
    
    # STEP 1: CLEANUP - Remove all node_modules and lock files
    print_info "🧹 STEP 1: Cleaning up all dependencies..."
    
    # Fix ownership before cleanup
    print_info "Fixing directory ownership for cleanup..."
    chown -R root:root "$app_dir" 2>/dev/null || print_warning "Could not change ownership"
    
    # Handle workspace/monorepo structure - node_modules is in parent directory
    print_info "Detected workspace structure - cleaning shared dependencies"
    print_info "Root directory: $app_dir"
    
    # Clean the parent directory (where the actual node_modules is)
    print_info "Removing shared node_modules from: $app_dir"
    rm -rf "$app_dir/node_modules" 2>/dev/null || true
    rm -rf "$app_dir/package-lock.json" 2>/dev/null || true
    rm -rf "$app_dir/.npm" 2>/dev/null || true
    
    # Clean all subdirectory lock files
    rm -rf "$app_dir/frontend/package-lock.json" 2>/dev/null || true  
    rm -rf "$app_dir/frontend/.npm" 2>/dev/null || true
    rm -rf "$app_dir/frontend/dist" 2>/dev/null || true  # Remove old build
    rm -rf "$app_dir/backend/package-lock.json" 2>/dev/null || true
    rm -rf "$app_dir/backend/.npm" 2>/dev/null || true
    
    # Clear npm cache
    npm cache clean --force 2>/dev/null || true
    
    # Verify cleanup worked
    if [ -d "$app_dir/node_modules" ]; then
        print_warning "node_modules still exists, forcing removal..."
        chmod -R 777 "$app_dir/node_modules" 2>/dev/null || true
        rm -rf "$app_dir/node_modules"
    fi
    
    print_info "✅ Cleanup completed - all dependencies removed"
    
    # STEP 2: INSTALL - Fresh install of all workspace dependencies
    print_info "📦 STEP 2: Installing fresh dependencies..."
    
    # Ensure we're in the correct directory
    cd "$app_dir"  # Go to root directory for workspace install
    print_info "Installing from workspace root: $(pwd)"
    print_info "🔍 Expected directory: $app_dir"
    
    # Verify we're in the right place
    if [ "$(pwd)" != "$app_dir" ]; then
        print_error "❌ Directory mismatch! Current: $(pwd), Expected: $app_dir"
        exit 1
    fi
    
    # First install all dependencies (npm install should include devDependencies by default)
    print_info "Running: npm install --no-cache --force"
    if npm install --no-cache --force; then
        print_info "✅ Initial npm install completed"
        
        # Debug: Check what was actually installed
        print_info "🔍 Checking what was installed..."
        print_info "Contents of .bin directory:"
        ls -la node_modules/.bin/ | head -10 || true
        
        # Vite may be installed in the frontend workspace, not the root
        if [ -f "$app_dir/frontend/node_modules/.bin/vite" ]; then
            print_info "✅ Vite available in frontend workspace: $app_dir/frontend/node_modules/.bin/vite"
        else
            print_warning "⚠️ Vite not in root .bin (expected in frontend workspace). We'll rely on npm run build which cds into frontend."
        fi
        
        # Note: Removed automatic TailwindCSS dependency installation to avoid version conflicts
        # The package.json should contain all required dependencies with correct versions
        print_info "📦 Using dependencies from package.json (avoiding version conflicts)"
        
    else
        print_error "❌ Root npm install failed!"
        exit 1
    fi
    
    print_info "✅ Dependencies installation completed"
    
    # Fix ownership back to www-data after install
    print_info "Restoring www-data ownership..."
    chown -R www-data:www-data "$app_dir" 2>/dev/null || print_warning "Could not restore www-data ownership"
    
    # Generate Prisma client after fresh install
    print_info "Generating Prisma client..."
    print_info "📂 Moving to backend directory: $app_dir/backend"
    cd "$app_dir/backend"
    pwd  # Show current directory
    
    # Verify we're in the backend directory
    if [ ! -f "prisma/schema.prisma" ]; then
        print_error "❌ Prisma schema not found! Current directory: $(pwd)"
        print_error "Expected to be in: $app_dir/backend"
        exit 1
    fi
    
    if npx prisma generate; then
        print_info "✅ Prisma client generated successfully"
    else
        print_warning "⚠️ Prisma generate failed, trying alternative method..."
        node ../node_modules/.bin/prisma generate || print_error "Prisma generate failed completely"
    fi
    
    # Run migrations
    print_info "Running database migrations..."
    cd "$app_dir/backend"
    
    # Set environment variables for Prisma
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
        
        # Debug: Check environment variables
        print_info "Environment variables loaded from .env"
        print_info "DATABASE_URL: ${DATABASE_URL:0:50}..." # Show first 50 chars only for security
        print_info "DB_HOST: $DB_HOST"
        print_info "DB_PORT: $DB_PORT"
        print_info "DB_NAME: $DB_NAME"
        print_info "DB_USER: $DB_USER"
        
        # Debug: Check what's available
        print_info "Checking for Prisma CLI..."
        print_info "npx available: $(command -v npx >/dev/null 2>&1 && echo 'yes' || echo 'no')"
        print_info "Local prisma binary: $([ -f "./node_modules/.bin/prisma" ] && echo 'yes' || echo 'no')"
        print_info "Parent prisma binary: $([ -f "../node_modules/.bin/prisma" ] && echo 'yes' || echo 'no')"
        
        # Fix Prisma engine permissions first
        print_info "Fixing Prisma engine permissions..."
        find "$app_dir/node_modules/@prisma/engines" -name "schema-engine-*" -exec chmod +x {} \; 2>/dev/null || true
        find "$app_dir/node_modules/@prisma/engines" -name "query-engine-*" -exec chmod +x {} \; 2>/dev/null || true
        find "$app_dir/node_modules/@prisma/engines" -name "migration-engine-*" -exec chmod +x {} \; 2>/dev/null || true
        find "$app_dir/node_modules/@prisma/engines" -name "introspection-engine-*" -exec chmod +x {} \; 2>/dev/null || true
        find "$app_dir/node_modules/@prisma/engines" -name "prisma-fmt-*" -exec chmod +x {} \; 2>/dev/null || true
        
        # Try different ways to run Prisma migrations
        # Skip npx if we know parent binary exists (npx has permission issues)
        if [ -f "$app_dir/node_modules/.bin/prisma" ]; then
            print_info "Using parent prisma binary with node"
            chmod +x "$app_dir/node_modules/.bin/prisma"
            node "$app_dir/node_modules/.bin/prisma" migrate deploy
        elif [ -f "./node_modules/.bin/prisma" ]; then
            print_info "Using local prisma binary with node"
            chmod +x ./node_modules/.bin/prisma
            node ./node_modules/.bin/prisma migrate deploy
        elif [ -f "$app_dir/node_modules/prisma/build/index.js" ]; then
            print_info "Using parent prisma build index directly"
            node "$app_dir/node_modules/prisma/build/index.js" migrate deploy
        elif [ -f "./node_modules/prisma/build/index.js" ]; then
            print_info "Using prisma build index directly"
            node ./node_modules/prisma/build/index.js migrate deploy
        elif command -v npx >/dev/null 2>&1; then
            print_info "Using npx prisma migrate deploy (fallback)"
            npx prisma migrate deploy
        else
            print_error "Prisma CLI not found. Trying to install..."
            npm install prisma @prisma/client
            npx prisma migrate deploy
        fi
        
        print_status "Database migrations completed"
    else
        print_error ".env file not found, cannot run migrations"
        exit 1
    fi
    
    # Stop service before rebuilding frontend
    print_info "Stopping service before frontend rebuild..."
    systemctl stop "$service_name" 2>/dev/null || print_warning "Service was not running or failed to stop"
    
    # Wait a moment for service to fully stop
    print_info "Waiting for service to fully stop..."
    sleep 2
    
    # STEP 3: BUILD - Build the frontend from ROOT directory (PERMANENT FIX)
    print_info "🏗️ STEP 3: Building frontend from ROOT directory..."
    
    # CRITICAL: Always build from ROOT where node_modules actually is
    cd "$app_dir"
    print_info "Building from ROOT directory: $(pwd)"
    print_info "This is where node_modules is located: $app_dir/node_modules"
    
    # Check if root package.json exists
    if [ ! -f "package.json" ]; then
        print_error "❌ package.json not found in root directory!"
        return 1
    fi
    
    # Check if frontend package.json exists
    if [ ! -f "frontend/package.json" ]; then
        print_error "❌ frontend/package.json not found!"
        return 1
    fi
    
    # Verify workspace node_modules exists
    if [ ! -d "node_modules" ]; then
        print_error "❌ node_modules not found in root directory: $(pwd)"
        print_error "This indicates the workspace install failed!"
        return 1
    fi
    
    # Vite may be installed within frontend workspace; do not fail if not in root
    if [ -f "node_modules/.bin/vite" ]; then
        print_info "✅ Vite binary found in root: $(pwd)/node_modules/.bin/vite"
    elif [ -f "frontend/node_modules/.bin/vite" ]; then
        print_info "✅ Vite binary found in frontend workspace: $(pwd)/frontend/node_modules/.bin/vite"
    else
        print_warning "⚠️ Vite not found in root .bin; relying on npm run build which cds into frontend"
    fi
    
    # Fix permissions for workspace binaries
    if [ -d "node_modules/.bin" ]; then
        print_info "Fixing workspace binary permissions..."
        chmod -R 755 node_modules/.bin/ 2>/dev/null || true
        chmod +x node_modules/.bin/* 2>/dev/null || true
    fi
    
    # Single-method build from ROOT (no fallbacks)
    print_info "🚀 Starting build process from ROOT directory..."
    # Reset PATH per instance to avoid bleed-over when updating multiple instances
    export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    export PATH="$(pwd)/node_modules/.bin:$PATH"
    print_info "Added root node_modules to PATH: $(pwd)/node_modules/.bin"
    # Do not remove frontend/node_modules; workspaces expect it for local bin links
    # Do not mutate package.json scripts arbitrarily

    # Ensure root build script runs backend then frontend
    print_info "Normalizing root build script to run backend then frontend..."
    npm pkg set "scripts.build=npm run build:backend && npm run build:frontend" >/dev/null 2>&1 || true
    print_info "Using original build scripts (build:backend && build:frontend)..."
    
    print_info "🧩 Installing dependencies at root..."
    # Ensure devDependencies are installed (vite et al.) regardless of environment
    PREV_NPM_CONFIG_PRODUCTION="${NPM_CONFIG_PRODUCTION-}"
    PREV_NODE_ENV="${NODE_ENV-}"
    export NPM_CONFIG_PRODUCTION=false
    unset npm_config_production
    export NODE_ENV=development
    npm install 2>&1 || { print_error "❌ npm install failed"; \
        [ -n "$PREV_NPM_CONFIG_PRODUCTION" ] && export NPM_CONFIG_PRODUCTION="$PREV_NPM_CONFIG_PRODUCTION" || unset NPM_CONFIG_PRODUCTION; \
        [ -n "$PREV_NODE_ENV" ] && export NODE_ENV="$PREV_NODE_ENV" || unset NODE_ENV; \
        return 1; }
    
    
    print_info "🏗️ Building project from root via npm run build..."
    npm run build 2>&1 || { print_error "❌ npm run build failed"; \
        [ -n "$PREV_NPM_CONFIG_PRODUCTION" ] && export NPM_CONFIG_PRODUCTION="$PREV_NPM_CONFIG_PRODUCTION" || unset NPM_CONFIG_PRODUCTION; \
        [ -n "$PREV_NODE_ENV" ] && export NODE_ENV="$PREV_NODE_ENV" || unset NODE_ENV; \
        return 1; }
    # Restore previous env after successful build
    if [ -n "$PREV_NPM_CONFIG_PRODUCTION" ]; then export NPM_CONFIG_PRODUCTION="$PREV_NPM_CONFIG_PRODUCTION"; else unset NPM_CONFIG_PRODUCTION; fi
    if [ -n "$PREV_NODE_ENV" ]; then export NODE_ENV="$PREV_NODE_ENV"; else unset NODE_ENV; fi
    if [ ! -d "$app_dir/frontend/dist" ]; then
        print_error "Build completed but $app_dir/frontend/dist directory not found!"
        return 1
    fi
    
    print_status "Frontend build completed successfully"
    
    # Copy frontend server.js if nginx is disabled
    if [ "$SETUP_NGINX" = "false" ]; then
        echo -e "${BLUE}📁 Copying frontend server.js...${NC}"
        cp $SCRIPT_DIR/frontend/server.js $app_dir/frontend/
        print_status "Frontend server.js copied"
    fi
    
    # Prepare environment for agent version creation
    export APP_DIR="$app_dir"
    if [ -f "$app_dir/backend/.env" ]; then
        db_url=$(grep "^DATABASE_URL=" "$app_dir/backend/.env" | cut -d'=' -f2-)
        if [ -n "$db_url" ]; then
            export DB_USER=$(echo "$db_url" | sed -E 's|.*://([^:]*):.*|\1|')
            export DB_PASS=$(echo "$db_url" | sed -E 's|.*://[^:]*:([^@]*)@.*|\1|')
            export DB_NAME=$(echo "$db_url" | sed -E 's|.*/([^?]*)\?.*|\1|')
        fi
    fi
    
    # Create/update agent version for the new version
    print_info "🤖 Creating/updating agent version..."
    create_agent_version
    
    # Restart services (at the very end of the update)
    print_info "Restarting backend service..."
    if systemctl restart "$service_name"; then
        print_status "Backend service $service_name restarted successfully"
        
        # Wait a moment and verify service is running
        sleep 3
        if systemctl is-active --quiet "$service_name"; then
            print_status "Service $service_name is running and healthy"
        else
            print_warning "Service $service_name may not have started properly"
            print_info "Check status with: systemctl status $service_name"
        fi
    else
        print_error "Failed to restart backend service $service_name"
        print_info "Check status with: systemctl status $service_name"
        print_info "Check logs with: journalctl -u $service_name -n 20"
        exit 1
    fi
    
    # Restart frontend service if nginx is disabled
    if [ "$SETUP_NGINX" = "false" ]; then
        local frontend_service_name="${service_name}-frontend"
        print_info "Restarting frontend service..."
        if systemctl restart "$frontend_service_name"; then
            print_status "Frontend service $frontend_service_name restarted successfully"
            
            # Wait a moment and verify service is running
            sleep 3
            if systemctl is-active --quiet "$frontend_service_name"; then
                print_status "Frontend service $frontend_service_name is running and healthy"
            else
                print_warning "Frontend service $frontend_service_name may not have started properly"
                print_info "Check status with: systemctl status $frontend_service_name"
            fi
        else
            print_error "Failed to restart frontend service $frontend_service_name"
            print_info "Check status with: systemctl status $frontend_service_name"
            print_info "Check logs with: journalctl -u $frontend_service_name -n 20"
        fi
    fi
    
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
    printf "${BLUE}%-30s %-10s %-15s %-10s %-12s %-15s${NC}\n" "FQDN" "Status" "Backend Port" "SSL" "Version" "Service Name"
    printf "${BLUE}%-30s %-10s %-15s %-10s %-12s %-15s${NC}\n" "$(printf '%*s' 30 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')" "$(printf '%*s' 10 | tr ' ' '-')" "$(printf '%*s' 12 | tr ' ' '-')" "$(printf '%*s' 15 | tr ' ' '-')"
    
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
            
            # Get version information using unified function
            app_dir="/opt/patchmon-$fqdn"
            
            # Try to find the app directory (handle custom paths)
            if [ ! -d "$app_dir" ]; then
                # Look for directories that might match this instance
                for dir in /opt/patchmon-*; do
                    if [ -d "$dir" ] && [ -f "$dir/backend/.env" ]; then
                        if grep -q "$fqdn" "$dir/backend/.env" 2>/dev/null; then
                            app_dir="$dir"
                            break
                        fi
                    fi
                done
            fi
            
            # Use unified version detection
            version=$(get_instance_version "$app_dir" "$fqdn" "$status" "$port")
            
            printf "%-30s %s %-15s %s %-12s %-15s\n" "$fqdn" "$status_display" "$port" "$ssl_display" "$version" "$service_name"
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
    echo "  deploy [public-repo]"
    echo "    Deploy a new PatchMon instance with interactive configuration"
    echo "    - Interactive FQDN setup with validation"
    echo "    - Branch selection (main/dev)"
    echo "    - Optional Let's Encrypt SSL certificate setup"
    echo "    - Optional timezone configuration"
    echo "    - Uses default repository: $DEFAULT_GITHUB_REPO"
    echo "    - Auto-generates all credentials"
    echo "    - Detects existing components (PostgreSQL, Nginx, Node.js)"
    echo "    - Assigns unique ports automatically"
    echo "    - Creates isolated Python virtual environments"
    echo "    - public-repo: Use HTTPS clone instead of SSH (simplified for public repos)"
    echo ""
    echo "  update [public-repo] [fqdn] [custom-path]"
    echo "    Update existing instance(s) with latest code"
    echo "    - Interactive mode: Shows numbered list of instances to select from"
    echo "    - Direct mode: Update specific instance by FQDN"
    echo "    - Supports multiple instance selection (1 3 5, 1-3, all)"
    echo "    - Automatically detects instance location if standard path not found"
    echo "    - Optionally specify custom instance path for direct mode"
    echo "    - public-repo: Use HTTPS instead of SSH for git operations"
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
    echo "  $0 deploy                                          # Interactive deployment"
    echo "  $0 deploy public-repo                              # Public repo deployment (HTTPS)"
    echo "  $0 update                                          # Interactive mode"
    echo "  $0 update public-repo                              # Interactive mode with HTTPS"
    echo "  $0 update customer1.patchmon.com                   # Update specific instance"
    echo "  $0 update public-repo customer1.patchmon.com       # Update with HTTPS"
    echo "  $0 update pmon.manage.9.technology /opt/patchmon-pmon_patchmon_db  # Custom path"
    echo "  $0 list"
    echo "  $0 status customer1.patchmon.com"
    echo ""
    echo "Features:"
    echo "  ✅ Interactive deployment configuration"
    echo "  ✅ FQDN validation and setup"
    echo "  ✅ Optional nginx reverse proxy setup"
    echo "  ✅ Optional Let's Encrypt SSL setup (when nginx enabled)"
    echo "  ✅ Optional timezone configuration"
    echo "  ✅ Smart component detection (skips already installed)"
    echo "  ✅ Automatic port allocation (prevents conflicts)"
    echo "  ✅ Isolated Node.js environments per instance"
    echo "  ✅ FQDN-based database and folder naming"
    echo "  ✅ Complete instance isolation"
    echo "  ✅ Automatic credential generation"
}

# Main execution
case $1 in
    "deploy")
        print_banner
        # Check for public-repo option
        if [ "$2" = "public-repo" ]; then
            PUBLIC_REPO_MODE="true"
            print_info "🌐 Public repository mode enabled - using HTTPS clone"
        fi
        deploy_instance
        ;;
    "update")
        print_banner
        shift
        # Check for public-repo option
        if [ "$1" = "public-repo" ]; then
            PUBLIC_REPO_MODE="true"
            print_info "🌐 Public repository mode enabled for update - using HTTPS"
            shift
        fi
        update_instance "$@"
        ;;
    "delete")
        print_banner
        delete_instance "$2"
        ;;
    "list")
        print_banner
        list_instances
        ;;
    "status")
        print_banner
        show_status "$2"
        ;;
    "help"|"-h"|"--help")
        print_banner
        show_help
        ;;
    *)
        print_banner
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
