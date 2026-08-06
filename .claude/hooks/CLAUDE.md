# .claude/hooks/ (bash gate scope)

Many hooks live in this directory; only `block-destructive-bash.sh` and `lib/` are the bash gate, and only those two are governed by `docs/security/bash-gate-threat-model.md`.

IMPORTANT: before starting a fix round on any finding against the gate, check it against that document's goals and non-goals first — a finding against a stated non-goal is logged there as an accepted risk, not a fix target.

YOU MUST NOT grow the gate back toward a general bash parser (rejected at 1,663 lines), harden it beyond what closing goals G1-G5 requires, or treat it as a security boundary rather than defense-in-depth; hardening that closes G1-G5 (Definition of done item 1) is required, not discouraged — target shape stays roughly 150-250 lines.

`~/.claude/hooks/block-destructive-bash.sh` is a symlink into this repo file: editing it here changes the live running guard immediately, with no install step.
