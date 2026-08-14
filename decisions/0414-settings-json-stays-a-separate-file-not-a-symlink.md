---
Status: accepted
Date: 2026-08-14T04:52:45.015Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0414. The live settings.json stays a separate hand-synced file rather than a symlink

## Context

With the other ten entries installed as direct repo symlinks, the consistent next step looked like symlinking ~/.claude/settings.json the same way, which would also end the two-file hand edit that c3 and c4 both had to perform. Reading the live file against the tracked one refuted it: Claude Code writes to ~/.claude/settings.json itself. Bash(node:*) sat in the live allow list and not the tracked one, pluginConfigs exists only live, and model diverges between them - the fingerprints of an "always allow" click and of settings changed through the interface. The deleted promotion manifest had already encoded exactly this, sorting keys into repo-owned (env, hooks, statusLine, sandbox, permissions) and live-owned (theme, model, enabledPlugins, pluginConfigs, effortLevel, tui, survey state) buckets, and merging rather than copying. The user also asked whether symlinking now would make re-adding a staging mechanism easier later.

## Options

- Symlink ~/.claude/settings.json like the other ten entries, for consistency
- Keep it a separate real file and hand-edit both on every permission change
- Keep it separate and add a small sync script that copies only the repo-owned keys into live

## Outcome

Symlinking is rejected. It would push every "always allow" click, theme change and plugin-config edit into the git working tree, and because the symlinks resolve through the working tree a branch checkout would silently swap the live permission rules. The premise that it would ease a future staging mechanism does not hold either: settings.json needs its own file because it MIXES committed configuration with machine state, and that mixture survives the symlink, so any future staging still needs the repo-owned versus live-owned key split the deleted manifest had. The sync script - roughly thirty lines copying the repo-owned keys, and the piece a future staging mechanism would reuse - was declared out of scope for this thread on the user's instruction. Until it exists, every permission edit must be applied to both files by hand or it is inert.
