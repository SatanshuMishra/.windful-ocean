#!/bin/bash

# ============================================================================
#                     CROSS-PLATFORM DOTFILES INSTALLER
# ============================================================================
# This script installs dotfiles using GNU Stow from the current repository location
# Supports macOS, Linux, and other Unix-like systems

set -e  # Exit on any error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the parent directory (the dotfiles repo root)
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Detect operating system
OS_TYPE="$(uname -s)"
case "${OS_TYPE}" in
    Darwin*)    OS_NAME="macOS";;
    Linux*)     OS_NAME="Linux";;
    CYGWIN*)    OS_NAME="Cygwin";;
    MINGW*)     OS_NAME="MinGW";;
    MSYS*)      OS_NAME="MSYS";;
    *)          OS_NAME="Unknown";;
esac

echo "🔧 Installing dotfiles from: $REPO_DIR"
echo "🖥️  Detected OS: $OS_NAME"

# Check if stow is installed, offer to install if not
if ! command -v stow &> /dev/null; then
    echo "❌ GNU Stow is not installed."
    echo ""
    
    case "$OS_NAME" in
        "macOS")
            echo "📦 Install options for macOS:"
            echo "   Homebrew: brew install stow"
            echo "   MacPorts: sudo port install stow"
            ;;
        "Linux")
            echo "📦 Install options for Linux:"
            if command -v apt &> /dev/null; then
                echo "   Ubuntu/Debian: sudo apt install stow"
            fi
            if command -v pacman &> /dev/null; then
                echo "   Arch: sudo pacman -S stow"
            fi
            if command -v dnf &> /dev/null; then
                echo "   Fedora: sudo dnf install stow"
            fi
            if command -v yum &> /dev/null; then
                echo "   RHEL/CentOS: sudo yum install stow"
            fi
            if command -v zypper &> /dev/null; then
                echo "   openSUSE: sudo zypper install stow"
            fi
            ;;
        *)
            echo "   Please install GNU Stow using your system's package manager"
            ;;
    esac
    
    echo ""
    read -p "❓ Would you like to attempt automatic installation? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Attempting to install stow..."
        
        case "$OS_NAME" in
            "macOS")
                if command -v brew &> /dev/null; then
                    brew install stow
                else
                    echo "❌ Homebrew not found. Please install Homebrew first or install stow manually."
                    exit 1
                fi
                ;;
            "Linux")
                if command -v apt &> /dev/null; then
                    sudo apt update && sudo apt install -y stow
                elif command -v pacman &> /dev/null; then
                    sudo pacman -S --noconfirm stow
                elif command -v dnf &> /dev/null; then
                    sudo dnf install -y stow
                elif command -v yum &> /dev/null; then
                    sudo yum install -y stow
                else
                    echo "❌ Could not detect package manager. Please install stow manually."
                    exit 1
                fi
                ;;
            *)
                echo "❌ Automatic installation not supported for $OS_NAME. Please install stow manually."
                exit 1
                ;;
        esac
        
        echo "✅ Stow installed successfully!"
    else
        echo "🚫 Installation cancelled. Please install stow manually and run this script again."
        exit 1
    fi
fi

# Change to the repo directory
cd "$REPO_DIR"

# Create backup directory with timestamp
BACKUP_DIR="$HOME/.dotfiles-backup-$(date +%Y%m%d_%H%M%S)"

# Dry run first to check for conflicts
echo "🔍 Checking for conflicts..."
if stow -nv . -t ~ 2>&1 | grep -q "WARNING\|ERROR"; then
    echo "⚠️  Conflicts detected. Creating backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup conflicting files
    stow -nv . -t ~ 2>&1 | grep "existing target is" | awk '{print $NF}' | while read -r file; do
        if [[ -e "$HOME/$file" ]]; then
            echo "  📋 Backing up: $file"
            mkdir -p "$BACKUP_DIR/$(dirname "$file")" 2>/dev/null || true
            mv "$HOME/$file" "$BACKUP_DIR/$file"
        fi
    done
    
    echo "📦 Backup created at: $BACKUP_DIR"
fi

# Install the dotfiles
echo "📦 Installing dotfiles..."
stow . -t ~

# OS-specific post-installation steps
case "$OS_NAME" in
    "macOS")
        echo "🍎 macOS-specific setup..."
        # Set up macOS-specific defaults if needed
        ;;
    "Linux")
        echo "🐧 Linux-specific setup..."
        # Set up Linux-specific configurations if needed
        ;;
esac

echo "✅ DOTFILES INSTALLED SUCCESSFULLY!"
echo ""
echo "📋 Next steps:"
echo "   1. Restart your terminal or run: source ~/.zshrc"
echo "   2. Install recommended tools:"

case "$OS_NAME" in
    "macOS")
        echo "      brew install eza bat fd ripgrep zoxide starship delta"
        ;;
    "Linux")
        echo "      # Use your package manager to install: eza bat fd-find ripgrep zoxide starship git-delta"
        ;;
esac

echo "   3. Set up Git configuration: git config --global user.name 'Your Name'"
echo "   4. Set up Git configuration: git config --global user.email 'your-email@example.com'"

if [[ -d "$BACKUP_DIR" ]]; then
    echo ""
    echo "🗂️  Your original files were backed up to: $BACKUP_DIR"
fi
