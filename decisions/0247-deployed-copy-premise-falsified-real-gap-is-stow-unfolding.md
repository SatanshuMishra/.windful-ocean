---
Status: accepted
Date: 2026-08-04T23:31:32.874Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0247. Close the deployed-lib-copies follow-up as false and document the Stow unfolding gap instead

## Context

The follow-up claimed ~/.claude/lib holds deployed regular-file copies, unlike the symlinked hook, and therefore needs a refresh step after any lib change. Verified false: ~/.claude/lib is a whole-directory symlink into the repo, and all six files the PR-tool relocation touched share inodes with their repo counterparts under -L resolution. No copy exists anywhere, so nothing can go stale. The real gap sits elsewhere and was never identified. ~/.claude/hooks and ~/.claude/rules are the only two entries that are real directories rather than symlinks, so each of their children is linked individually and a NEW top-level file in either does not go live until scripts/install_config.sh reruns. Files inside already-linked subdirectories such as hooks/lib, hooks/tests, rules/common and rules/typescript are unaffected. One live instance exists today, .claude/hooks/session-config-drift-check.sh, which is inert because it is gitignored by the *session* pattern and referenced by no settings.json hook entry.

## Options

- Add the refresh step the follow-up asked for
- Close the follow-up as falsified and add nothing
- Close it as falsified and document the real gap that the investigation surfaced instead

## Outcome

Closed as falsified, with the real gap documented in docs/TROUBLESHOOTING.md under Installation Issues, chosen over README because a silently dead hook is a troubleshooting symptom rather than a setup-flow fact. The stated CAUSE was corrected during review and this is the part worth carrying forward: both agents attributed the unfolding to install_config.sh pre-mkdir-ing the two directories, but its loop pre-mkdirs EVERY top-level .claude subdirectory and mkdir -p through an existing symlink-to-directory is a no-op, so the loop cannot be what singles these two out. The actual cause is live-only content Stow cannot fold around - a graphify-out cache in each, plus rules/context7.md. Because graphify-out regenerates, those two directories will stay unfolded permanently. The orphaned symlink was deliberately NOT created by hand: the class of gap is the durable finding, and hand-linking one instance would paper over it.
