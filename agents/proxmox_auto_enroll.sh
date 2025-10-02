#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Trap to catch any unexpected exits
trap 'echo "[ERROR] Script exited unexpectedly at line $LINENO with exit code $?"' ERR EXIT

SCRIPT_VERSION="1.0.0-debug.9"
echo "[DEBUG] Script Version: $SCRIPT_VERSION ($(date +%Y-%m-%d\ %H:%M:%S))"

# =============================================================================
# PatchMon Proxmox LXC Auto-Enrollment Script
# =============================================================================
# This script discovers LXC containers on a Proxmox host and automatically
# enrolls them into PatchMon for patch management.
#
# Usage:
#   1. Set environment variables or edit configuration below
#   2. Run: bash proxmox_auto_enroll.sh
#
# Requirements:
#   - Must run on Proxmox host (requires 'pct' command)
#   - Auto-enrollment token from PatchMon
#   - Network access to PatchMon server
# =============================================================================

# ===== CONFIGURATION =====
PATCHMON_URL="${PATCHMON_URL:-https://patchmon.example.com}"
AUTO_ENROLLMENT_KEY="${AUTO_ENROLLMENT_KEY:-}"
AUTO_ENROLLMENT_SECRET="${AUTO_ENROLLMENT_SECRET:-}"
CURL_FLAGS="${CURL_FLAGS:--s}"
DRY_RUN="${DRY_RUN:-false}"
HOST_PREFIX="${HOST_PREFIX:-proxmox-}"
SKIP_STOPPED="${SKIP_STOPPED:-true}"
PARALLEL_INSTALL="${PARALLEL_INSTALL:-false}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"

# ===== COLOR OUTPUT =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===== LOGGING FUNCTIONS =====
info() { echo -e "${GREEN}[INFO]${NC} $1"; return 0; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; return 0; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; return 0; }
debug() { [[ "${DEBUG:-false}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} $1" || true; return 0; }

# ===== BANNER =====
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ____       _       _     __  __                            ║
║  |  _ \ __ _| |_ ___| |__ |  \/  | ___  _ __                ║
║  | |_) / _` | __/ __| '_ \| |\/| |/ _ \| '_ \               ║
║  |  __/ (_| | || (__| | | | |  | | (_) | | | |              ║
║  |_|   \__,_|\__\___|_| |_|_|  |_|\___/|_| |_|              ║
║                                                               ║
║         Proxmox LXC Auto-Enrollment Script                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo ""

# ===== VALIDATION =====
info "Validating configuration..."

if [[ -z "$AUTO_ENROLLMENT_KEY" ]] || [[ -z "$AUTO_ENROLLMENT_SECRET" ]]; then
    error "AUTO_ENROLLMENT_KEY and AUTO_ENROLLMENT_SECRET must be set"
fi

if [[ -z "$PATCHMON_URL" ]]; then
    error "PATCHMON_URL must be set"
fi

# Check if running on Proxmox
if ! command -v pct &> /dev/null; then
    error "This script must run on a Proxmox host (pct command not found)"
fi

# Check for required commands
for cmd in curl jq; do
    if ! command -v $cmd &> /dev/null; then
        error "Required command '$cmd' not found. Please install it first."
    fi
done

info "Configuration validated successfully"
info "PatchMon Server: $PATCHMON_URL"
info "Dry Run Mode: $DRY_RUN"
info "Skip Stopped Containers: $SKIP_STOPPED"
echo ""

# ===== DISCOVER LXC CONTAINERS =====
info "Discovering LXC containers..."
lxc_list=$(pct list | tail -n +2)  # Skip header

if [[ -z "$lxc_list" ]]; then
    warn "No LXC containers found on this Proxmox host"
    exit 0
fi

# Count containers
total_containers=$(echo "$lxc_list" | wc -l)
info "Found $total_containers LXC container(s)"
echo ""

info "Initializing statistics..."
# ===== STATISTICS =====
enrolled_count=0
skipped_count=0
failed_count=0
info "Statistics initialized"

# ===== PROCESS CONTAINERS =====
info "Starting container processing loop..."
while IFS= read -r line; do
    info "[DEBUG] Read line from lxc_list"
    vmid=$(echo "$line" | awk '{print $1}')
    status=$(echo "$line" | awk '{print $2}')
    name=$(echo "$line" | awk '{print $3}')

    info "Processing LXC $vmid: $name (status: $status)"

    # Skip stopped containers if configured
    if [[ "$status" != "running" ]] && [[ "$SKIP_STOPPED" == "true" ]]; then
        warn "  Skipping $name - container not running"
        ((skipped_count++))
        echo ""
        continue
    fi

    # Check if container is stopped
    if [[ "$status" != "running" ]]; then
        warn "  Container $name is stopped - cannot gather info or install agent"
        ((skipped_count++))
        echo ""
        continue
    fi

    # Get container details
    debug "  Gathering container information..."
    hostname=$(timeout 5 pct exec "$vmid" -- hostname 2>/dev/null </dev/null || echo "$name")
    ip_address=$(timeout 5 pct exec "$vmid" -- hostname -I 2>/dev/null </dev/null | awk '{print $1}' || echo "unknown")
    os_info=$(timeout 5 pct exec "$vmid" -- cat /etc/os-release 2>/dev/null </dev/null | grep "^PRETTY_NAME=" | cut -d'"' -f2 || echo "unknown")

    friendly_name="${HOST_PREFIX}${hostname}"

    info "  Hostname: $hostname"
    info "  IP Address: $ip_address"
    info "  OS: $os_info"

    if [[ "$DRY_RUN" == "true" ]]; then
        info "  [DRY RUN] Would enroll: $friendly_name"
        ((enrolled_count++))
        echo ""
        continue
    fi

    # Call PatchMon auto-enrollment API
    info "  Enrolling $friendly_name in PatchMon..."
    
    response=$(curl $CURL_FLAGS -X POST \
        -H "X-Auto-Enrollment-Key: $AUTO_ENROLLMENT_KEY" \
        -H "X-Auto-Enrollment-Secret: $AUTO_ENROLLMENT_SECRET" \
        -H "Content-Type: application/json" \
        -d "{
            \"friendly_name\": \"$friendly_name\",
            \"metadata\": {
                \"vmid\": \"$vmid\",
                \"proxmox_node\": \"$(hostname)\",
                \"ip_address\": \"$ip_address\",
                \"os_info\": \"$os_info\"
            }
        }" \
        "$PATCHMON_URL/api/v1/auto-enrollment/enroll" \
        -w "\n%{http_code}" 2>&1)

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" == "201" ]]; then
        api_id=$(echo "$body" | jq -r '.host.api_id' 2>/dev/null || echo "")
        api_key=$(echo "$body" | jq -r '.host.api_key' 2>/dev/null || echo "")

        if [[ -z "$api_id" ]] || [[ -z "$api_key" ]]; then
            error "  Failed to parse API credentials from response"
        fi

        info "  ✓ Host enrolled successfully: $api_id"

        # Install PatchMon agent in container
        info "  Installing PatchMon agent..."
        
        # Download and execute in separate steps to avoid stdin issues with piping
        install_output=$(timeout 180 pct exec "$vmid" -- bash -c "
            cd /tmp
            curl $CURL_FLAGS \
                -H \"X-API-ID: $api_id\" \
                -H \"X-API-KEY: $api_key\" \
                -o patchmon-install.sh \
                '$PATCHMON_URL/api/v1/hosts/install' && \
            bash patchmon-install.sh && \
            rm -f patchmon-install.sh
        " 2>&1 </dev/null) || install_exit_code=$?
        
        # Set exit code to 0 if not already set (command succeeded)
        install_exit_code=${install_exit_code:-0}

        if [[ $install_exit_code -eq 0 ]]; then
            info "  ✓ Agent installed successfully in $friendly_name"
            ((enrolled_count++))
        elif [[ $install_exit_code -eq 124 ]]; then
            warn "  ⏱ Agent installation timed out (>180s) in $friendly_name"
            info "  Install output: $install_output"
            ((failed_count++))
        else
            warn "  ✗ Failed to install agent in $friendly_name (exit: $install_exit_code)"
            info "  Install output: $install_output"
            ((failed_count++))
        fi

    elif [[ "$http_code" == "409" ]]; then
        warn "  ⊘ Host $friendly_name already enrolled - skipping"
        ((skipped_count++))
    elif [[ "$http_code" == "429" ]]; then
        error "  ✗ Rate limit exceeded - maximum hosts per day reached"
        ((failed_count++))
    else
        error "  ✗ Failed to enroll $friendly_name - HTTP $http_code"
        debug "  Response: $body"
        ((failed_count++))
    fi

    echo ""
    sleep 1  # Rate limiting between containers

done <<< "$lxc_list"

# ===== SUMMARY =====
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                     ENROLLMENT SUMMARY                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
info "Total Containers Found: $total_containers"
info "Successfully Enrolled:  $enrolled_count"
info "Skipped:                $skipped_count"
info "Failed:                 $failed_count"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    warn "This was a DRY RUN - no actual changes were made"
    warn "Set DRY_RUN=false to perform actual enrollment"
fi

if [[ $failed_count -gt 0 ]]; then
    warn "Some containers failed to enroll. Check the logs above for details."
    exit 1
fi

info "Auto-enrollment complete! ✓"
exit 0

