```
          _           _  __       _
__      _(_)_ __   __| |/ _|_   _| |       ___   ___ ___  __ _ _ __
\ \ /\ / / | '_ \ / _` | |_| | | | |_____ / _ \ / __/ _ \/ _` | '_ \
 \ V  V /| | | | | (_| |  _| |_| | |_____| (_) | (_|  __/ (_| | | | |
(_)_/\_/ |_|_| |_|\__,_|_|  \__,_|_|      \___/ \___\___|\__,_|_| |_|
```

[![test](https://github.com/SatanshuMishra/.windful-ocean/actions/workflows/test.yml/badge.svg)](https://github.com/SatanshuMishra/.windful-ocean/actions/workflows/test.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**My personal macOS dotfiles: a terminal environment (shell, editor, tmux, git, terminal) plus a Claude Code agent configuration, symlinked into `$HOME` with GNU Stow.**

## What's in here

```
.windful-ocean/
├── .claude/          Claude Code agent configuration
│   ├── CLAUDE.md         always-loaded global instructions summary
│   ├── settings.json     hook wiring, tool permissions, enabled plugins
│   ├── rules/            standing coding, testing, and security rules
│   ├── agents/           subagent definitions
│   ├── skills/           procedures a session can invoke by name
│   ├── hooks/            scripts that fire on Claude Code events
│   └── lib/              shared library code used by the hooks and skills
├── .config/          app configs in the standard XDG layout
│   ├── nvim/             Neovim editor configuration
│   ├── tmux/             tmux configuration
│   ├── ripgrep/          ripgrep search defaults
│   ├── git/              git's XDG ignore file
│   └── starship.toml     Starship prompt configuration
├── .githooks/        this repo's git pre-commit hook (runs the test suite before a commit)
├── .github/          GitHub Actions CI workflows and the PR labeler
├── .semgrep/         Semgrep static-analysis helper files
├── docs/             longer reference docs
├── scripts/          install, update, and CI helper scripts
├── .zshrc                Zsh shell config: prompt, plugins, aliases, CLI tool wiring
├── .wezterm.lua          WezTerm terminal emulator config
├── .gitconfig            global git config; tracked here but not linked by the installer
├── .gitignore_global     global gitignore
├── .gitattributes_global global gitattributes
├── .stow-local-ignore    files GNU Stow skips when linking
├── .semgrepignore        paths Semgrep skips
├── package.json          defines the npm test command
├── receipts.config.json  config for the receipts CI check
├── LICENSE               Apache 2.0 license text
└── NOTICE                attribution notice
```

`.gitconfig` is tracked here but not linked by the installer. If you want it, apply it by hand.

For the deeper detail, see [`.config/nvim/README.md`](.config/nvim/README.md) for the full Neovim reference, and [`.claude/README.md`](.claude/README.md) for the full agent-config reference.

## Install

1. Clone the repo. It can live anywhere; the installer always links into `$HOME`.

   ```bash
   git clone https://github.com/SatanshuMishra/.windful-ocean.git ~/.dotfiles
   cd ~/.dotfiles
   ```

2. Run the installer.

   ```bash
   ./scripts/install_config.sh
   ```

   It installs GNU Stow if it's missing, backs up any file it would overwrite into a timestamped backup folder, then symlinks everything into `$HOME`.

3. (Optional) Point git at this repo's own pre-commit hook, only needed if you'll be editing this repo.

   ```bash
   ./scripts/install-hooks.sh
   ```

4. Load the new shell config: `source ~/.zshrc`, or just open a new terminal.

5. Install the CLI tools the shell expects.

   ```bash
   brew install eza bat fd ripgrep zoxide starship delta
   ```

6. Set your git identity, since `.gitconfig` is not linked automatically.

   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

7. Confirm it worked: `ls -la ~/.zshrc ~/.claude/CLAUDE.md`. Both should show as symlinks (`->`) pointing back into the clone.

## Update

**Pull repo changes onto this machine.** Run `git pull` inside the repo. Since the live files are symlinks into the repo, anything already linked updates instantly, no re-install needed.

**Link new files.** If the pull added brand-new files or directories, re-run `./scripts/install_config.sh` to link them in. Re-running it is safe.

**Push machine-side edits back into the repo.** Run `./scripts/update_config.sh`. It copies your live Neovim, tmux, `.zshrc`, and `.wezterm.lua` config back into the repo, shows what changed, then asks before committing and pushing.

## Uninstall

There's no uninstall script, so do it by hand.

1. Remove the symlinks Stow created, run from inside the repo:

   ```bash
   stow -D -d "$(dirname "$PWD")" -t "$HOME" "$(basename "$PWD")"
   ```

2. `~/.claude` and `~/.config` are real folders whose contents were linked individually, so check for and remove any leftover symlinks that still point into the repo, for example `~/.claude/CLAUDE.md` and `~/.config/nvim`.

3. Restore anything the installer moved aside, from the timestamped `~/.dotfiles-backup-YYYYMMDD_HHMMSS/` folder it created.

4. If you ran the hooks installer, undo it from inside the repo: `git config --unset core.hooksPath`.

5. `.gitconfig` was never linked, so there's nothing to undo there. Delete the clone itself when you want it fully gone.

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
