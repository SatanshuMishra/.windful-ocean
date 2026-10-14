```
            _      _
 ___ __ _ _(_)_ __| |_ ___
(_-</ _| '_| | '_ \  _(_-<
/__/\__|_| |_| .__/\__/__/
             |_|
```

# scripts

The scripts that install, check and keep this repository live. See the [root README](../README.md) for how this fits into the repository as a whole.

## What a human runs

- **`dotfiles/cli.mjs`** — the one command line, `node scripts/dotfiles/cli.mjs`, with four commands. Detail: [root README, How it works](../README.md#how-it-works).
  - `install` links every entry of `dotfiles/links.json` from the clone it runs in into the home folder, moving anything in the way to `~/.dotfiles-backup/<time>/`.
  - `check` reports missing links, links replaced by real files or folders, links pointing elsewhere and links it cannot read, and changes nothing. A SessionStart hook runs it in every new Claude Code session.
  - `sync` merges the tracked `.claude/settings.json` into the real `~/.claude/settings.json`, where machine keys such as model, enabledPlugins, theme and effortLevel stay.
  - `cutover` switches the links from the development checkout to the live clone `~/.windful-ocean`, and refuses and lists every difference until the two copies match.
- **`dotfiles/links.json`** — the link manifest: each link is a source inside the clone and a target inside the home folder.
- **`dotfiles/tests/`** — the test suite for the command line, run by `npm test` at the repository root.

## Hooks installer

- **`install-hooks.sh`** — 9 lines. Points git at this repository's own hooks by running `git config core.hooksPath .githooks`, so `.githooks/pre-commit` runs on commit.

## Repo tooling

`scripts/repo/` holds checks that no CI workflow runs; `npm test` at the repository root runs their tests, and a person can run a script by hand:

- **`skill-router-lint.mjs`** — lints every `SKILL.md` under `.claude/skills/`: required frontmatter fields, a routing table shaped correctly, and a size ceiling of 4096 bytes per skill file.
- **`tests/`** — the test suite for that script and the repository censuses (`skill-router-lint.test.mjs`, `gitlink-census.test.mjs`, `control-byte-census.test.mjs`, `stripstrings-hang-census.test.mjs`, `confirmation-claim-census.test.mjs`), run by `npm test` at the repository root.

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
