# nvim-daily-driver: Make Neovim 0.12 a working daily editor: startup fixes, plugin modernization, terminal parity
Status: active
Updated: 2026-10-24T01:47:12.628Z
Next ids: c5 D3 R2 S1

## Goal

Neovim 0.12.6 with the tracked config in .config/nvim starts with no errors or deprecation warnings, every plugin is updated and deprecated or unsafe ones are replaced or removed, language servers attach, and Neovim looks the same in WezTerm and Warp.

## Done when

- [ ] c1 nvim --headless startup and opening .lua/.ts/.py files print no error and no deprecation warning
- [ ] c2 every plugin is on a current commit in lazy-lock.json, with no hand-written commit values, and each deprecated or unsafe plugin is replaced or removed
- [ ] c3 a language server attaches on .lua, .ts and .py files
- [ ] c4 WezTerm and Warp render Neovim with the same background, font, line height, padding, cursor and Nerd Font glyphs, as far as each terminal can be configured

## Where things stand

Diagnosis done; building in a worktree off origin/main. A researcher agent is finding Warp's settings.toml keys for font family, line height and padding.

## Next step

Build all fixes on one branch in a worktree off origin/main, verify with isolated headless nvim runs, commit, push with an explicit -u origin, and open one ready pull request assigned to the user.

## Decisions in force

- D1 Lane: direct lane for every issue, at the user's explicit request; one branch, one pull request, no spec and no review agent; interphase stopped before writing files.
- D2 Terminal reference look: the tracked .wezterm.lua is the reference; Warp and Neovim are aligned to it.

## Open risks

- R1 The dev checkout's main cannot fast-forward (untracked .lighthouse/profile.json would be overwritten); the branch is cut from origin/main.

## Settled, do not reopen

## Where the details live

- Config: .config/nvim (live via ~/.config/nvim -> ~/.windful-ocean/.config/nvim)
- Terminal configs: .wezterm.lua (tracked, missing from scripts/dotfiles/links.json since the 2026-10-14 Stow-to-manifest cutover, so WezTerm runs on defaults); ~/.warp/settings.toml (untracked)
