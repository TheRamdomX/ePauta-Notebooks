#!/bin/bash

# Open Notebook Migration Script
# Backup and restore persistent data for migration between machines
# Usage: ./migrate.sh backup|restore [backup_file.zip]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_FILE="${2:-open-notebook-backup-$(date +%Y%m%d-%H%M%S).zip}"

# Directories to backup
BACKUP_DIRS=(
    "surreal_data"
    "redis_data"
    "notebook_data"
)

# Config files to backup
CONFIG_FILES=(
    ".env"
    "docker-compose.yml"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Function to backup data
backup_data() {
    local backup_file="$1"

    echo ""
    print_status "Starting backup to: $backup_file"
    echo ""

    # Check if Docker containers are running
    if docker ps --format '{{.Names}}' | grep -q open-notebook; then
        print_warning "Docker containers are running. Stopping them for safe backup..."
        docker-compose down
        sleep 2
    fi

    # Create temporary directory for backup
    local temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    mkdir -p "$temp_dir/backup"

    # Backup data directories
    print_status "Backing up data directories..."
    for dir in "${BACKUP_DIRS[@]}"; do
        if [ -d "$SCRIPT_DIR/$dir" ]; then
            print_status "  Backing up: $dir"
            cp -r "$SCRIPT_DIR/$dir" "$temp_dir/backup/"
        else
            print_warning "  Directory not found: $dir (skipping)"
        fi
    done

    # Backup config files
    print_status "Backing up configuration files..."
    for file in "${CONFIG_FILES[@]}"; do
        if [ -f "$SCRIPT_DIR/$file" ]; then
            print_status "  Backing up: $file"
            cp "$SCRIPT_DIR/$file" "$temp_dir/backup/"
        else
            print_warning "  File not found: $file (skipping)"
        fi
    done

    # Create metadata file
    cat > "$temp_dir/backup/BACKUP_INFO.txt" << EOF
Open Notebook Backup
====================
Created: $(date)
Hostname: $(hostname)
Script Version: 1.0

Included directories:
EOF

    for dir in "${BACKUP_DIRS[@]}"; do
        if [ -d "$SCRIPT_DIR/$dir" ]; then
            echo "  - $dir/" >> "$temp_dir/backup/BACKUP_INFO.txt"
        fi
    done

    echo "" >> "$temp_dir/backup/BACKUP_INFO.txt"
    echo "Included files:" >> "$temp_dir/backup/BACKUP_INFO.txt"

    for file in "${CONFIG_FILES[@]}"; do
        if [ -f "$SCRIPT_DIR/$file" ]; then
            echo "  - $file" >> "$temp_dir/backup/BACKUP_INFO.txt"
        fi
    done

    # Create zip file
    print_status "Creating zip archive..."
    cd "$temp_dir"
    zip -r -q "$SCRIPT_DIR/$backup_file" backup/
    cd "$SCRIPT_DIR"

    # Get backup size
    local size=$(du -h "$backup_file" | cut -f1)

    echo ""
    print_status "Backup completed successfully!"
    print_status "Backup file: $backup_file (Size: $size)"
    echo ""
    print_status "To restore on another machine:"
    echo "  1. Copy $backup_file to the open-notebook root directory"
    echo "  2. Run: ./migrate.sh restore $backup_file"
    echo ""
}

# Function to restore data
restore_data() {
    local backup_file="$1"

    echo ""
    print_status "Starting restore from: $backup_file"
    echo ""

    # Validate backup file
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi

    # Check if backup contains valid structure
    if ! unzip -t "$backup_file" &>/dev/null; then
        print_error "Invalid or corrupted backup file: $backup_file"
        exit 1
    fi

    # Check if Docker containers are running
    if docker ps --format '{{.Names}}' | grep -q open-notebook; then
        print_warning "Docker containers are running. Stopping them for restore..."
        docker-compose down
        sleep 2
    fi

    # Create temporary directory for extraction
    local temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    # Extract backup
    print_status "Extracting backup file..."
    unzip -q "$backup_file" -d "$temp_dir"

    # Check if BACKUP_INFO exists to validate structure
    if [ ! -f "$temp_dir/backup/BACKUP_INFO.txt" ]; then
        print_error "Invalid backup file structure. Cannot find BACKUP_INFO.txt"
        exit 1
    fi

    # Show backup info
    print_status "Backup Information:"
    cat "$temp_dir/backup/BACKUP_INFO.txt" | sed 's/^/  /'
    echo ""

    # Ask for confirmation
    read -p "Do you want to proceed with restore? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_warning "Restore cancelled"
        exit 0
    fi

    # Restore data directories
    print_status "Restoring data directories..."
    for dir in "${BACKUP_DIRS[@]}"; do
        if [ -d "$temp_dir/backup/$dir" ]; then
            print_status "  Restoring: $dir"
            # Remove existing directory if it exists
            if [ -d "$SCRIPT_DIR/$dir" ]; then
                rm -rf "$SCRIPT_DIR/$dir"
            fi
            cp -r "$temp_dir/backup/$dir" "$SCRIPT_DIR/"
        fi
    done

    # Restore config files
    print_status "Restoring configuration files..."
    for file in "${CONFIG_FILES[@]}"; do
        if [ -f "$temp_dir/backup/$file" ]; then
            print_status "  Restoring: $file"
            cp "$temp_dir/backup/$file" "$SCRIPT_DIR/$file"
        fi
    done

    echo ""
    print_status "Restore completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  1. Review the restored .env and docker-compose.yml files"
    echo "  2. Run: docker-compose up -d"
    echo "  3. Monitor logs: docker-compose logs -f"
    echo ""
}

# Function to show usage
show_usage() {
    echo "Open Notebook Migration Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  backup [backup_file.zip]   Create a backup of all persistent data"
    echo "  restore <backup_file.zip>  Restore data from a backup"
    echo ""
    echo "Examples:"
    echo "  $0 backup                                    # Creates: open-notebook-backup-20260519-225733.zip"
    echo "  $0 backup my-backup.zip                      # Creates: my-backup.zip"
    echo "  $0 restore open-notebook-backup-20260519-225733.zip"
    echo ""
}

# Main script logic
if [ $# -lt 1 ]; then
    print_error "No command specified"
    echo ""
    show_usage
    exit 1
fi

case "$1" in
    backup)
        backup_data "$BACKUP_FILE"
        ;;
    restore)
        if [ $# -lt 2 ]; then
            print_error "Restore requires a backup file argument"
            echo ""
            show_usage
            exit 1
        fi
        restore_data "$2"
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
