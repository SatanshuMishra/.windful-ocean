#!/bin/bash

#  NOTE: COPY NEOVIM CONFIG INTO REPO
cp -r ~/.config/nvim/* ~/Documents/GitHub/.windful-ocean/.config/nvim

#  NOTE: AUTOMATICALLY COMMIT CHANGES

cd ~/Documents/GitHub/.windful-ocean
git add .
git commit -m "Auto-commit: Update Neovim config"
git push origin main

