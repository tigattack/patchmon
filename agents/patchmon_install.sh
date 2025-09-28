#!/bin/bash

# PatchMon Agent Installation Script
# Usage: curl -sSL {PATCHMON_URL}/api/v1/hosts/install | bash -s -- {PATCHMON_URL} {API_ID} {API_KEY}

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
error() {
    echo -e "${RED}❌ ERROR: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root (use sudo)"
fi

# Install required dependencies
info "📦 Installing required dependencies..."

# Detect package manager and install jq
if command -v apt-get >/dev/null 2>&1; then
    # Debian/Ubuntu
    apt-get update >/dev/null 2>&1
    apt-get install -y jq curl >/dev/null 2>&1
elif command -v yum >/dev/null 2>&1; then
    # CentOS/RHEL 7
    yum install -y jq curl >/dev/null 2>&1
elif command -v dnf >/dev/null 2>&1; then
    # CentOS/RHEL 8+/Fedora
    dnf install -y jq curl >/dev/null 2>&1
elif command -v zypper >/dev/null 2>&1; then
    # openSUSE
    zypper install -y jq curl >/dev/null 2>&1
elif command -v pacman >/dev/null 2>&1; then
    # Arch Linux
    pacman -S --noconfirm jq curl >/dev/null 2>&1
elif command -v apk >/dev/null 2>&1; then
    # Alpine Linux
    apk add --no-cache jq curl >/dev/null 2>&1
else
    warning "Could not detect package manager. Please ensure 'jq' and 'curl' are installed manually."
fi

# Verify jq installation
if ! command -v jq >/dev/null 2>&1; then
    error "Failed to install 'jq'. Please install it manually: https://stedolan.github.io/jq/download/"
fi

success "Dependencies installed successfully!"

# Default server URL (will be replaced by backend with configured URL)
PATCHMON_URL="http://localhost:3001"

# Parse arguments
if [[ $# -ne 3 ]]; then
    echo "Usage: curl -sSL {PATCHMON_URL}/api/v1/hosts/install | bash -s -- {PATCHMON_URL} {API_ID} {API_KEY}"
    echo ""
    echo "Example:"
    echo "curl -sSL http://patchmon.example.com/api/v1/hosts/install | bash -s -- http://patchmon.example.com patchmon_1a2b3c4d abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    echo ""
    echo "Contact your PatchMon administrator to get your API credentials."
    exit 1
fi

PATCHMON_URL="$1"
API_ID="$2"
API_KEY="$3"

# Validate inputs
if [[ ! "$PATCHMON_URL" =~ ^https?:// ]]; then
    error "Invalid URL format. Must start with http:// or https://"
fi

if [[ ! "$API_ID" =~ ^patchmon_[a-f0-9]{16}$ ]]; then
    error "Invalid API ID format. API ID should be in format: patchmon_xxxxxxxxxxxxxxxx"
fi

if [[ ! "$API_KEY" =~ ^[a-f0-9]{64}$ ]]; then
    error "Invalid API Key format. API Key should be 64 hexadecimal characters."
fi

info "🚀 Installing PatchMon Agent..."
info "   Server: $PATCHMON_URL"
info "   API ID: $API_ID"

# Create patchmon directory
info "📁 Creating configuration directory..."
mkdir -p /etc/patchmon

# Download the agent script
info "📥 Downloading PatchMon agent script..."
curl -sSL "$PATCHMON_URL/api/v1/hosts/agent/download" -o /usr/local/bin/patchmon-agent.sh
chmod +x /usr/local/bin/patchmon-agent.sh

# Get the agent version from the downloaded script
AGENT_VERSION=$(grep '^AGENT_VERSION=' /usr/local/bin/patchmon-agent.sh | cut -d'"' -f2)
info "📋 Agent version: $AGENT_VERSION"

# Get expected agent version from server
EXPECTED_VERSION=$(curl -s "$PATCHMON_URL/api/v1/hosts/agent/version" | grep -o '"currentVersion":"[^"]*' | cut -d'"' -f4 2>/dev/null || echo "Unknown")
if [[ "$EXPECTED_VERSION" != "Unknown" ]]; then
    info "📋 Expected version: $EXPECTED_VERSION"
    if [[ "$AGENT_VERSION" != "$EXPECTED_VERSION" ]]; then
        warning "⚠️  Agent version mismatch! Installed: $AGENT_VERSION, Expected: $EXPECTED_VERSION"
    fi
fi

# Get update interval policy from server
UPDATE_INTERVAL=$(curl -s "$PATCHMON_URL/api/v1/settings/update-interval" | grep -o '"updateInterval":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "60")
info "📋 Update interval: $UPDATE_INTERVAL minutes"

# Create credentials file
info "🔐 Setting up API credentials..."
cat > /etc/patchmon/credentials << EOF
# PatchMon API Credentials
# Generated on $(date)
PATCHMON_URL="$PATCHMON_URL"
API_ID="$API_ID"
API_KEY="$API_KEY"
EOF

chmod 600 /etc/patchmon/credentials

# Test the configuration
info "🧪 Testing configuration..."
if /usr/local/bin/patchmon-agent.sh test; then
    success "Configuration test passed!"
else
    error "Configuration test failed. Please check your credentials."
fi

# Send initial update
info "📊 Sending initial package data..."
if /usr/local/bin/patchmon-agent.sh update; then
    success "Initial package data sent successfully!"
else
    warning "Initial package data failed, but agent is configured. You can run 'patchmon-agent.sh update' manually."
fi

# Setup crontab for automatic package status updates
info "⏰ Setting up automatic package status update every $UPDATE_INTERVAL minutes..."
if [[ $UPDATE_INTERVAL -eq 60 ]]; then
    # Hourly updates
    echo "0 * * * * /usr/local/bin/patchmon-agent.sh update >/dev/null 2>&1" | crontab -
else
    # Custom interval updates
    echo "*/$UPDATE_INTERVAL * * * * /usr/local/bin/patchmon-agent.sh update >/dev/null 2>&1" | crontab -
fi

success "🎉 PatchMon Agent installation complete!"
echo ""
echo "📋 Installation Summary:"
echo "   • Dependencies installed: jq, curl"
echo "   • Agent installed: /usr/local/bin/patchmon-agent.sh"
echo "   • Agent version: $AGENT_VERSION"
if [[ "$EXPECTED_VERSION" != "Unknown" ]]; then
    echo "   • Expected version: $EXPECTED_VERSION"
fi
echo "   • Config directory: /etc/patchmon/"
echo "   • Credentials file: /etc/patchmon/credentials"
echo "   • Status updates: Every $UPDATE_INTERVAL minutes via crontab"
echo "   • View logs: tail -f /var/log/patchmon-agent.log"
echo ""
echo "🔧 Manual commands:"
echo "   • Test connection: patchmon-agent.sh test"
echo "   • Send update: patchmon-agent.sh update"
echo "   • Check status: patchmon-agent.sh ping"
echo ""
success "Your host is now connected to PatchMon!"

