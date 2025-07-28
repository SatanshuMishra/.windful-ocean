#!/bin/bash

#  NOTE: UPDATE DOTFILES REPOSITORY FROM CURRENT SYSTEM CONFIG
#  This script safely updates the repository with current system configurations

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the parent directory (the dotfiles repo root)
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔄 Updating dotfiles repository from system config..."

# Change to repo directory
cd "$REPO_DIR"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Cannot update."
    exit 1
fi

# Update configs from system to repo (reverse of stow)
echo "📋 Copying current system configs to repository..."

# Only update if the target directories exist
if [ -d "$HOME/.config/nvim" ]; then
    echo "  → Updating Neovim config"
    rsync -av --delete "$HOME/.config/nvim/" ".config/nvim/"
fi

if [ -f "$HOME/.zshrc" ]; then
    echo "  → Updating .zshrc"
    cp "$HOME/.zshrc" "./"
fi

if [ -f "$HOME/.wezterm.lua" ]; then
    echo "  → Updating .wezterm.lua"
    cp "$HOME/.wezterm.lua" "./"
fi

if [ -d "$HOME/.config/tmux" ]; then
    echo "  → Updating tmux config"
    rsync -av --delete "$HOME/.config/tmux/" ".config/tmux/"
fi

# Show what changed
echo "📊 Changes detected:"
git status --porcelain

# Ask user if they want to commit
echo ""
read -p "🤔 Do you want to commit these changes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "💾 Committing changes..."
    git add .
    
    # Prompt for commit message
    read -p "📝 Enter commit message (or press Enter for default): " commit_msg
    if [ -z "$commit_msg" ]; then
        commit_msg="Update dotfiles configuration - $(date '+%Y-%m-%d %H:%M')"
    fi
    
    git commit -m "$commit_msg"
    
    # Ask about pushing
    read -p "🚀 Push to remote? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push
        echo "✅ Changes pushed to remote!"
    else
        echo "📦 Changes committed locally (not pushed)"
    fi
else
    echo "🚫 Changes not committed"
fi

echo "✅ UPDATE COMPLETE!"

