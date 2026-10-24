# nvim-daily-driver: Make Neovim 0.12 a working daily editor: startup fixes, plugin modernization, terminal parity
Status: done
Updated: 2026-10-24T02:52:57.453Z
Next ids: c5 D5 R4 S1

## Goal

Neovim 0.12.6 with the tracked config in .config/nvim starts with no errors or deprecation warnings, every plugin is updated and deprecated or unsafe ones are replaced or removed, language servers attach, and (per D3 and D4) WezTerm, the only supported terminal, and Neovim share the Catppuccin Mocha palette.

## Done when

- [x] c1 nvim --headless startup and opening .lua/.ts/.py files print no error and no deprecation warning evidence: isolated-XDG headless probes on f8d89caa printed an empty :messages for bare startup, a.lua, a.ts and a.py; :checkhealth vim.deprecated reports none; Lazy! load all plus every colorscheme printed nothing
- [x] c2 every plugin is on a current commit in lazy-lock.json, with no hand-written commit values, and each deprecated or unsafe plugin is replaced or removed evidence: committed lazy-lock.json holds 56 entries, all 40-hex SHAs from Lazy! sync; neodev->lazydev, presence->neocord, harpoon->harpoon2, nvim-treesitter master->main; mini.comment, mini.hipatterns, nvim-lightbulb removed
- [x] c3 a language server attaches on .lua, .ts and .py files evidence: probes on f8d89caa report lua_ls, ts_ls and pylsp clients, after reinstalling five Mason Python venvs whose interpreter had been removed
- [x] c4 (per D3 and D4) WezTerm and Neovim share the Catppuccin Mocha palette, and WezTerm renders Neovim with JetBrainsMono Nerd Font Mono and its Nerd Font glyphs evidence: on ee9667df the live WezTerm config resolves Catppuccin Mocha (bg 1e1e2e, fg cdd6f4) and WezTerm's font resolver renders A, the folder, custom-folder and Lua glyphs from JetBrainsMonoNerdFontMono-Regular.ttf; headless Neovim on the live config loads catppuccin-mocha with Normal fg cdd6f4 bg 1e1e2e, attaches lua_ls, prints no messages and leaves the lockfile unchanged; the WezTerm window itself was not viewed

## Where things stand

All work is merged and live: ~/.windful-ocean and the dev checkout are at ee9667df, with all 55 plugins on their locked commits, and no branch or worktree of this thread remains.

## Next step

None: every criterion is met; close the thread as done.

## Decisions in force

- D1 Lane: direct lane for every issue, at the user's explicit request; one branch, one pull request, no spec and no review agent; interphase stopped before writing files.
- D3 WezTerm is the only supported terminal; Warp compatibility is removed from the repository and from ~/.warp/settings.toml (owner's answer).
- D4 WezTerm and Neovim both use Catppuccin Mocha (owner's request); Neovim's forced black background goes, since it would paint over the theme.

## Open risks

- R3 On a machine whose plugin clones predate the branch switches (nvim-treesitter and textobjects master->main, harpoon->harpoon2), the first start rewrites lazy-lock.json with the stale commits and :Lazy restore then obeys them; recover with git restore of the lockfile, then :Lazy restore with Neovim closed.

## Settled, do not reopen

## Where the details live

- Config: .config/nvim (live via ~/.config/nvim -> ~/.windful-ocean/.config/nvim)
- Terminal config: .wezterm.lua (tracked, linked through scripts/dotfiles/links.json)
- Warp backup: ~/.warp/settings.toml.bak-2026-10-23, differing from the live file only by the owner's own Warp theme switch; the owner may delete it
- Recovery notes: auto-memory lazy-rewrites-the-live-lockfile (R3's recovery) and mason-python-venvs-bind-to-one-interpreter (pylsp "not installed" when its Python vanishes)
