# nvim-daily-driver: Make Neovim 0.12 a working daily editor: startup fixes, plugin modernization, terminal parity
Status: active
Updated: 2026-10-24T01:41:26.460Z
Next ids: c5 D1 R1 S1

## Goal

Neovim 0.12.6 with the tracked config in .config/nvim starts with no errors or deprecation warnings, every plugin is updated and deprecated or unsafe ones are replaced or removed, language servers attach, and Neovim looks the same in WezTerm and Warp.

## Done when

- [ ] c1 nvim --headless startup and opening .lua/.ts/.py files print no error and no deprecation warning
- [ ] c2 every plugin is on a current commit in lazy-lock.json, with no hand-written commit values, and each deprecated or unsafe plugin is replaced or removed
- [ ] c3 a language server attaches on .lua, .ts and .py files
- [ ] c4 WezTerm and Warp render Neovim with the same background, font, line height, padding, cursor and Nerd Font glyphs, as far as each terminal can be configured

## Where things stand

Not started.

## Next step

Run the full-lane interphase interview (feature pathway) for the nvim-daily-driver request, then hand off to mitosis on the FEATURE branch cut from origin/main.

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- Config: .config/nvim (live via ~/.config/nvim -> ~/.windful-ocean/.config/nvim)
- Terminal configs: .wezterm.lua and docs/WARP-LIKE-SETUP.md tracked; ~/.warp/settings.toml untracked
- Top risk: dev checkout main cannot fast-forward (untracked .lighthouse/profile.json would be overwritten); build from origin/main
