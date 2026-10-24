# nvim-daily-driver: Make Neovim 0.12 a working daily editor: startup fixes, plugin modernization, terminal parity
Status: active
Updated: 2026-10-24T02:37:00.942Z
Next ids: c5 D5 R4 S1

## Goal

Neovim 0.12.6 with the tracked config in .config/nvim starts with no errors or deprecation warnings, every plugin is updated and deprecated or unsafe ones are replaced or removed, language servers attach, and Neovim looks the same in WezTerm and Warp.

## Done when

- [x] c1 nvim --headless startup and opening .lua/.ts/.py files print no error and no deprecation warning evidence: isolated-XDG headless probes on f8d89caa printed an empty :messages for bare startup, a.lua, a.ts and a.py; :checkhealth vim.deprecated reports none; Lazy! load all plus every colorscheme printed nothing
- [x] c2 every plugin is on a current commit in lazy-lock.json, with no hand-written commit values, and each deprecated or unsafe plugin is replaced or removed evidence: committed lazy-lock.json holds 56 entries, all 40-hex SHAs from Lazy! sync; neodev->lazydev, presence->neocord, harpoon->harpoon2, nvim-treesitter master->main; mini.comment, mini.hipatterns, nvim-lightbulb removed
- [x] c3 a language server attaches on .lua, .ts and .py files evidence: probes on f8d89caa report lua_ls, ts_ls and pylsp clients, after reinstalling five Mason Python venvs whose interpreter had been removed
- [ ] c4 (per D3 and D4) WezTerm and Neovim share the Catppuccin Mocha palette, and WezTerm renders Neovim with JetBrainsMono Nerd Font Mono and its Nerd Font glyphs

## Where things stand

Merged work is live: ~/.windful-ocean and the dev checkout are clean at 7f3f695a, ~/.wezterm.lua is linked, and all 55 plugins sit on their locked commits. Branch feat/catppuccin-wezterm-only (worktree .claude/worktrees/catppuccin-wezterm-only, cut from 7f3f695a) holds no changes yet; it is to carry two commits, removing Warp support and switching WezTerm and Neovim to Catppuccin Mocha. The owner asked whether changes can skip branches: the "Require PR for Merge" ruleset on main has no bypass, so a PR is required unless the owner adds a bypass.

## Next step

Owner chooses one PR for the batch, or adds a ruleset bypass so direct-lane changes push to main; then build both commits, verify with headless nvim and a WezTerm config check, and revert the two Warp lines in ~/.warp/settings.toml.

## Decisions in force

- D1 Lane: direct lane for every issue, at the user's explicit request; one branch, one pull request, no spec and no review agent; interphase stopped before writing files.
- D3 WezTerm is the only supported terminal; Warp compatibility is removed from the repository and from ~/.warp/settings.toml (owner's answer).
- D4 WezTerm and Neovim both use Catppuccin Mocha (owner's request); Neovim's forced black background goes, since it would paint over the theme.

## Open risks

- R3 On a machine whose plugin clones predate the branch switches (nvim-treesitter and textobjects master->main, harpoon->harpoon2), the first start rewrites lazy-lock.json with the stale commits and :Lazy restore then obeys them; recover with git restore of the lockfile, then :Lazy restore with Neovim closed.

## Settled, do not reopen

## Where the details live

- Config: .config/nvim (live via ~/.config/nvim -> ~/.windful-ocean/.config/nvim)
- Terminal config: .wezterm.lua (tracked, linked through scripts/dotfiles/links.json); ~/.warp/settings.toml holds two Warp lines to revert, original at ~/.warp/settings.toml.bak-2026-10-23
- Recovery notes: auto-memory lazy-rewrites-the-live-lockfile (R3's recovery) and mason-python-venvs-bind-to-one-interpreter (pylsp "not installed" when its Python vanishes)
