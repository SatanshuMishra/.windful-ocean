#!/bin/bash

# Copy Neovim config files to the existing repository directory
cp -r ~/.config/nvim/* ~/Documents/GitHub/.windful-ocean/.config/nvim

# Navigate to the repository directory
cd ~/Documents/GitHub/.windful-ocean

# Add, commit, and push changes
git add .
git commit -m "Auto-commit: Update Neovim config"
git push origin main

