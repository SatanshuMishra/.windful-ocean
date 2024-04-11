#!/bin/bash

cd .config
git add .
git commit -m "Syncing Nvim config changes"
git push origin main  # Assuming 'master' is your config repo's main branch

cd ..
git add .config
git commit -m "Updated Nvim config"
git push origin main  # Assuming 'master' is your main repo's main branch
