```
            _      _
 ___ __ _ _(_)_ __| |_ ___
(_-</ _| '_| | '_ \  _(_-<
/__/\__|_| |_| .__/\__/__/
             |_|
```

# scripts

The scripts that install, update, and check this repository. See the [root README](../README.md) for how this fits into the repository as a whole.

## What a human runs

- **`install_config.sh`** — the one command from a fresh clone. Detects the OS, installs GNU Stow if missing, backs up conflicting files, and symlinks the repository into `$HOME`. Detail: [root README, Install](../README.md#install) and [How it works](../README.md#how-it-works).
- **`update_config.sh`** — the reverse direction: copies live config from `$HOME` back into the repository (`rsync --delete` for Neovim and tmux, a plain copy for `.zshrc` and `.wezterm.lua`), shows what changed, then asks before committing or pushing.

## Hooks installer

- **`install-hooks.sh`** — 9 lines. Points git at this repository's own hooks by running `git config core.hooksPath .githooks`, so `.githooks/pre-commit` runs on commit.

## Repo tooling (what CI runs)

`scripts/repo/` holds the checks and archival tools GitHub Actions runs against this repository, not anything a person runs by hand day to day:

- **`skill-router-lint.mjs`** — lints every `SKILL.md` under `.claude/skills/`: required frontmatter fields, a routing table shaped correctly, and a size ceiling of 4096 bytes per skill file.
- **`archive-agent-ledger.mjs`** and **`agent-ledger-archive-verify.mjs`** — write and then verify a manifest (`agent-ledger-archive-manifest.json`) recording the SHA-256 of every archived agent-ledger event file, so an archive round can be checked for completeness and integrity rather than trusted on sight.
- **`tests/`** — the test suite for the four scripts above (`gitlink-census.test.mjs`, `control-byte-census.test.mjs`, `stripstrings-hang-census.test.mjs`, `confirmation-claim-census.test.mjs`), run by `npm test` at the repository root.

## Regenerating the banners

The ASCII banners at the top of this file, `../README.md`, and `../.claude/README.md` were generated with [figlet](http://www.figlet.org/). The root README's banner:

```bash
figlet -f standard ".windful-ocean"
```

The `.claude/README.md` and this file's banners, both in the smaller font:

```bash
figlet -f small ".claude"
figlet -f small "scripts"
```
