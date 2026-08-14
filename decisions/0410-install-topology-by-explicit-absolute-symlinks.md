---
Status: accepted
Date: 2026-08-14T03:31:25.328Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0410. The ten entries are installed as explicit absolute symlinks, not through install_config.sh

## Context

0407 required the ten promoted entries re-pointed straight at the repo, and the plan named scripts/install_config.sh as the instrument. A no-op `stow -nv -R` dry run showed that script does something materially different from what c17 specifies. It is a whole-repo GNU Stow package rooted at the repo, not a .claude installer, and its conflict-reconciliation loop (install_config.sh:127) parses stow's own conflict messages and MOVES any target that does not already resolve into the repo. Four concrete consequences: it would move the live global ~/.claude/settings.json into a dated backup dir and replace it with a symlink to the repo copy, which lacks pluginConfigs and carries a different enabledPlugins set - and that file is the one the ledger already records as a real file written by promote.mjs; it would link four entries beyond the ten (ledger-archive-v1, reports, worktrees, settings.local.json), the last being the 44KB of accreted one-off rules that c4 exists to truncate; it would write roughly thirteen non-config repo artifacts into $HOME (LICENSE, NOTICE, package.json, robots.txt, ai.txt, graphify-out, receipts.config.json) and relocate the existing ~/docs; and its mkdir loop (install_config.sh:159) pre-creates each ~/.claude subdir, defeating stow tree-folding so the result is per-file symlinks rather than the ten entry-level symlinks the criterion names.

## Options

- Run scripts/install_config.sh as the plan named, and repair the collateral afterwards
- Fix install_config.sh first, then run it, so one instrument owns the topology
- Create the ten entries directly as explicit absolute symlinks and leave the installer untouched
- Create them as stow-style relative symlinks to stay compatible with a future stow run

## Outcome

Create the ten directly as explicit absolute symlinks; the installer was not run and was not modified. Absolute rather than relative because the repo-linked dotfiles already in place (.zshrc, .config/*, .tmux, .gitignore_global) are absolute, and the dry run shows stow SKIPS those with "Ignoring an absolute symlink" - so absolute links are the convention here AND the shape a later stow run will not fight, while relative links would be adopted and re-managed by it. Ten explicit ln -sfn calls are deterministic, auditable and reversible in one loop, and they touch nothing outside the ten; the criterion asks for exactly this end state and nothing more. Verified after: all ten resolve into the repo with readable content, all 16 hook paths registered in global settings resolve again, and settings.json remains a real 8850-byte file. Fixing the installer was rejected as a separate concern from c17 and larger than it - but it is now a live hazard rather than dormant, because running it would undo this topology and clobber global settings.json, so it must be fixed or retired before anyone invokes it by reflex.
