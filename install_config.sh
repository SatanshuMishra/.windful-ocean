#!/bin/bash

# Source directory (existing repository)
SOURCE_DIR=~/Documents/GitHub/.windful-ocean/.config/nvim

# Destination directory (Neovim config directory)
DEST_DIR=~/.config/nvim

# Check if destination directory exists, if not, create it
if [ ! -d "$DEST_DIR" ]; then
    mkdir -p "$DEST_DIR"
fi

# Copy contents of source directory to destination directory
cp -r "$SOURCE_DIR"/* "$DEST_DIR"

echo "Neovim config files copied successfully."
