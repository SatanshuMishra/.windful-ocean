```
          _           _  __       _
__      _(_)_ __   __| |/ _|_   _| |       ___   ___ ___  __ _ _ __
\ \ /\ / / | '_ \ / _` | |_| | | | |_____ / _ \ / __/ _ \/ _` | '_ \
 \ V  V /| | | | | (_| |  _| |_| | |_____| (_) | (_|  __/ (_| | | | |
(_)_/\_/ |_|_| |_|\__,_|_|  \__,_|_|      \___/ \___\___|\__,_|_| |_|
```

[![ci](https://github.com/SatanshuMishra/.windful-ocean/actions/workflows/ci.yml/badge.svg)](https://github.com/SatanshuMishra/.windful-ocean/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**My personal macOS dotfiles: a terminal environment (shell, editor, tmux, git, terminal) plus a Claude Code agent configuration, symlinked into `$HOME` from a link manifest.**

## What's in here

```
.windful-ocean/
├── .claude/          Claude Code agent configuration
│   ├── CLAUDE.md         always-loaded global instructions summary
│   ├── settings.json     base of hooks, permissions and environment that sync merges into ~/.claude/settings.json
│   ├── rules/            standing coding, testing, and security rules
│   ├── agents/           subagent definitions
│   ├── skills/           procedures a session can invoke by name
│   ├── hooks/            scripts that fire on Claude Code events
│   └── lib/              shared library code used by the hooks and skills
├── .config/          app configs in the standard XDG layout
│   ├── nvim/             Neovim editor configuration
│   ├── tmux/             tmux configuration
│   ├── ripgrep/          ripgrep search defaults
│   ├── git/              git's XDG global ignore file
│   └── starship.toml     Starship prompt configuration
├── .githooks/        this repo's git pre-commit hook (runs the test suite before a commit)
├── .github/          the one ci workflow and the ruleset payload that makes it required
├── docs/             longer reference docs
├── scripts/          the dotfiles command line, the git-hook installer and repo checks
├── .zshrc                Zsh shell config: prompt, plugins, aliases, CLI tool wiring
├── .wezterm.lua          WezTerm terminal emulator config
├── .gitconfig            global git config; linked to ~/.gitconfig.dotfiles
├── .gitattributes_global global gitattributes
├── package.json          defines the npm test and test:ci commands
├── receipts.config.json  config for the locally enabled receipts plugin
├── LICENSE               Apache 2.0 license text
└── NOTICE                attribution notice
```

`.gitconfig` is linked to `~/.gitconfig.dotfiles`. Git does not read that name by itself; pull it into your own `~/.gitconfig` with `git config --global include.path ~/.gitconfig.dotfiles`.

For the deeper detail, see [`.config/nvim/README.md`](.config/nvim/README.md) for the full Neovim reference, and [`.claude/README.md`](.claude/README.md) for the full agent-config reference.

## How it works

One command line, `node scripts/dotfiles/cli.mjs`, with four commands. It reads the link manifest, `scripts/dotfiles/links.json`, which lists each link as a source inside the clone and a target inside the home folder. Only configuration is listed: no `LICENSE`, `NOTICE`, `package.json`, `docs/` or other repository files are linked into `$HOME`.

| Command | What it does |
|---|---|
| `node scripts/dotfiles/cli.mjs install` | Links every entry of `scripts/dotfiles/links.json` from the clone it runs in into the home folder. Anything in the way is moved to `~/.dotfiles-backup/<time>/`. |
| `node scripts/dotfiles/cli.mjs check` | Reports missing links, links replaced by real files or folders, links pointing elsewhere and links it cannot read. It changes nothing. A SessionStart hook runs it in every new Claude Code session. |
| `node scripts/dotfiles/cli.mjs sync` | Merges the tracked `.claude/settings.json` (repository keys such as hooks, permissions and env) into the real `~/.claude/settings.json`. Machine keys such as model, enabledPlugins, theme and effortLevel stay in that real file. |
| `node scripts/dotfiles/cli.mjs cutover` | Switches the links from the development checkout to the live clone. One time only; see [Cutover](#cutover). |

Two folders matter:

- **The live clone**, `~/.windful-ocean`, only tracks `main` and is never edited. After the cutover, `~/.claude` and the dotfile links resolve into it.
- **The development checkout**, wherever you cloned the repository to work in. Every change is made, committed and pushed from there.

A write guard enforces this: it refuses Edit and Write into `~/.claude` config and into `~/.windful-ocean`, and names the development-checkout path to edit instead.

## Install

On a fresh machine:

1. Clone the repo to `~/.windful-ocean`.

   ```bash
   git clone https://github.com/SatanshuMishra/.windful-ocean.git ~/.windful-ocean
   ```

2. Link the config into `$HOME`, then merge the settings base into `~/.claude/settings.json`.

   ```bash
   node ~/.windful-ocean/scripts/dotfiles/cli.mjs install
   node ~/.windful-ocean/scripts/dotfiles/cli.mjs sync
   ```

   `install` moves anything it would overwrite into `~/.dotfiles-backup/<time>/` and prints one line per link it places. `sync` creates `~/.claude/settings.json` from the base when it is absent and keeps every machine key it already holds.

3. (Optional) Point git at this repo's own pre-commit hook, only needed if you'll be editing this repo.

   ```bash
   ./scripts/install-hooks.sh
   ```

4. Load the new shell config: `source ~/.zshrc`, or just open a new terminal.

5. Install the CLI tools the shell expects.

   ```bash
   brew install eza bat fd ripgrep zoxide starship delta
   ```

6. Set your git identity, either in `~/.gitconfig` or through the `~/.gitconfig.dotfiles` link described above.

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

7. Confirm it worked: `node ~/.windful-ocean/scripts/dotfiles/cli.mjs check` prints `check: all 16 links in place`.

## Update

Keep the live clone current with a fast-forward pull, then relink and resync:

```bash
git -C ~/.windful-ocean pull --ff-only
node ~/.windful-ocean/scripts/dotfiles/cli.mjs install
node ~/.windful-ocean/scripts/dotfiles/cli.mjs sync
```

`install` leaves links that are already in place untouched and links any entry the pull added. `sync` adds new hooks, permissions and environment keys from the base without touching your machine keys.

Never edit the live clone. Make changes in the development checkout, merge them to `main`, then run the three commands above.

## Cutover

Until the cutover, `~/.claude` and the dotfile links point into the development checkout, so a half-finished edit there is live in every running session. The cutover is a one-time move to the live clone. It refuses and lists every difference unless the content every link resolves to is identical in both copies, so running sessions see no change.

In order:

1. Merge the roster and tooling pull requests.
2. In the development checkout, commit or discard the changes under linked folders and `git pull`.
3. Remove the six links the old install left pointing at files that no longer exist: `rm ~/.gitignore_global ~/.config/autostart ~/.config/fish ~/.config/github-copilot ~/.config/silicon ~/.config/wezterm`. Then run node scripts/dotfiles/cli.mjs check in the development checkout and fix the problems it reports.
4. `git clone https://github.com/SatanshuMishra/.windful-ocean.git ~/.windful-ocean`.
5. Run `node ~/.windful-ocean/scripts/dotfiles/cli.mjs cutover`. It refuses and lists every difference until the two copies match, and it copies untracked files such as `.claude/skills/synced` across. When it succeeds it repoints each link to the live clone and ends with `cutover: done`.
6. In the development checkout, run `git restore --staged --worktree .claude/settings.json`, since `~/.claude/settings.json` is now a real file.
7. Merge the hooks pull request, then update the live clone as described in [Update](#update).

Going back is `node <development checkout>/scripts/dotfiles/cli.mjs install`.

## CI

CI is one workflow, `ci`: gitleaks over the pushed range, then `install`, `sync` and `check` into an empty home, then `npm run test:ci`. The payload `.github/rulesets/require-ci.json` makes it a required check on the default branch once you apply it:

```bash
gh api --method POST repos/SatanshuMishra/.windful-ocean/rulesets --input .github/rulesets/require-ci.json
```

## Uninstall

1. Delete each link that `scripts/dotfiles/links.json` lists: for every entry, remove its target under `$HOME` (for example `~/.zshrc`, `~/.claude/CLAUDE.md` and `~/.config/nvim`) when it is a symlink into the clone.

2. Restore anything the installer moved aside, from the `~/.dotfiles-backup/<time>/` folder it created.

3. `~/.claude/settings.json` is a real file that holds your machine choices; delete it only if you want those gone too.

4. If you ran the hooks installer, undo it from inside the repo: `git config --unset core.hooksPath`.

5. Remove the `include.path` line for `~/.gitconfig.dotfiles` from `~/.gitconfig` if you added it. Delete the clone itself, `~/.windful-ocean`, when you want it fully gone.

## Docs

| Doc | Reach for it when |
|---|---|
| [`docs/CUSTOMIZATION.md`](docs/CUSTOMIZATION.md) | You want to personalize a part of the setup rather than replace it. |
| [`docs/KEYBINDINGS.md`](docs/KEYBINDINGS.md) | You forgot a shortcut. |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Something in the install or the tooling is broken. |
| [`docs/WARP-LIKE-SETUP.md`](docs/WARP-LIKE-SETUP.md) | You want the terminal to feel like Warp. |
| [`docs/security/bash-gate-threat-model.md`](docs/security/bash-gate-threat-model.md) | You need to understand what the Bash-command gate defends against. |
| [`.config/nvim/README.md`](.config/nvim/README.md) | You need the full Neovim reference. |
| [`.claude/README.md`](.claude/README.md) | You need the full agent-configuration reference. |

## License

This project is licensed under the [Apache License, Version 2.0](LICENSE).

- Redistributions of this software, with or without modification, must retain the [NOTICE](NOTICE) file, per section 4(d) of the license.
- The Neovim configuration under `.config/nvim/` derives from kickstart.nvim and stays under the MIT License; see `.config/nvim/LICENSE.md`.
