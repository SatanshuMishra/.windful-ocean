# nvim-daily-driver: Make Neovim 0.12 a working daily editor: startup fixes, plugin modernization, terminal parity
Status: active
Updated: 2026-10-24T02:14:22.293Z
Next ids: c5 D3 R3 S1

## Goal

Neovim 0.12.6 with the tracked config in .config/nvim starts with no errors or deprecation warnings, every plugin is updated and deprecated or unsafe ones are replaced or removed, language servers attach, and Neovim looks the same in WezTerm and Warp.

## Done when

- [x] c1 nvim --headless startup and opening .lua/.ts/.py files print no error and no deprecation warning evidence: isolated-XDG headless probes on f8d89caa printed an empty :messages for bare startup, a.lua, a.ts and a.py; :checkhealth vim.deprecated reports none; Lazy! load all plus every colorscheme printed nothing
- [x] c2 every plugin is on a current commit in lazy-lock.json, with no hand-written commit values, and each deprecated or unsafe plugin is replaced or removed evidence: committed lazy-lock.json holds 56 entries, all 40-hex SHAs from Lazy! sync; neodev->lazydev, presence->neocord, harpoon->harpoon2, nvim-treesitter master->main; mini.comment, mini.hipatterns, nvim-lightbulb removed
- [x] c3 a language server attaches on .lua, .ts and .py files evidence: probes on f8d89caa report lua_ls, ts_ls and pylsp clients, after reinstalling five Mason Python venvs whose interpreter had been removed
- [ ] c4 WezTerm and Warp render Neovim with the same background, font, line height, padding, cursor and Nerd Font glyphs, as far as each terminal can be configured

## Where things stand

PR SatanshuMishra/.windful-ocean#342 (branch fix/nvim-daily-driver, head f8d89caa) is open, ready and assigned to the owner. Warp's local settings carry font_name JetBrainsMono Nerd Font Mono and line_height_ratio 1.0; Warp rendering is unseen and its cursor and padding are unchanged.

## Next step

Owner checks Warp rendering, says yes or no to the synced Warp cursor and padding changes, and merges PR #342; then pull ~/.windful-ocean --ff-only, run node scripts/dotfiles/cli.mjs install, and :Lazy restore in Neovim.

## Decisions in force

- D1 Lane: direct lane for every issue, at the user's explicit request; one branch, one pull request, no spec and no review agent; interphase stopped before writing files.
- D2 Terminal reference look: the tracked .wezterm.lua is the reference; Warp and Neovim are aligned to it.

## Open risks

- R2 Warp cursor colour (theme YAML cursor key) and padding (alt_screen_padding) are cloud-synced settings; changing them edits the owner's Warp account and waits for an explicit yes.

## Settled, do not reopen

## Where the details live

- Config: .config/nvim (live via ~/.config/nvim -> ~/.windful-ocean/.config/nvim)
- Terminal configs: .wezterm.lua (tracked, linked through scripts/dotfiles/links.json on the PR branch); ~/.warp/settings.toml (untracked, backup at ~/.warp/settings.toml.bak-2026-10-23)
