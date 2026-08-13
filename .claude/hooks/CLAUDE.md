# .claude/hooks/ (permission gate scope)

Many hooks live in this directory; only `permission-gate.mjs` and `.claude/lib/permission-gate/` are the layer 3 gate, and only those two are governed by `docs/security/bash-gate-threat-model.md`. It absorbed the retired `block-destructive-bash.sh`.

IMPORTANT: before starting a fix round on any finding against the gate, check it against that document's goals and non-goals first — a finding against a stated non-goal is logged there as an accepted risk, not a fix target.

The gate is ONE PreToolUse decision function returning `allow` or `block`, never `ask`. Its predicates run in the fixed order P0 to P6 defined in `.claude/lib/permission-gate/decide.mjs`, cheapest and most decisive first, and it fails OPEN except at P1, P2 and P5 — the predicates guarding effects for which no recovery copy can exist. Observer hooks that only log or annotate stay separate and must never gate.

YOU MUST NOT grow the gate back toward a general bash parser (rejected at 1,663 lines), harden it beyond what closing goals G1-G5 requires, or treat it as a security boundary rather than defense-in-depth; hardening that closes G1-G5 (Definition of done item 1) is required, not discouraged. Add a predicate to the ordered table rather than a second gating hook — the predicates share repository root, worktree set and dirty status, and every extra script pays 22 to 32 ms of interpreter startup on every matching call.

`~/.claude/hooks/` entries are symlinks into this repo directory: editing a hook here changes the live running guard immediately, with no install step.
