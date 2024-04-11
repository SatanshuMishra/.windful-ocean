#!/bin/bash

#  NOTE: INSTALL NEOVIM
#  This code installs neovim into the root directory of a MacOS device.

SOURCE_DIR=~/Documents/GitHub/.windful-ocean/.config/nvim
DEST_DIR=~/.config/nvim

#  NOTE: CHECK IF NEOVIM CONFIG FOLDER EXISTS

if [ ! -d "$DEST_DIR" ]; then
    mkdir -p "$DEST_DIR"
fi

#  NOTE: COPY CONTENTS
cp -r "$SOURCE_DIR"/* "$DEST_DIR"

echo "✅ CONFIG INSTALLED SUCCESSFULLY."
