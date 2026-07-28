---
Status: accepted
Date: 2026-07-28T19:18:39.231Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0071. Merge conflict on the nosemgrep pragmas resolves toward the bare directive

## Context

Merging origin/main into fix/ledger-lint-boundary-guards conflicts on exactly two lines, both a nosemgrep pragma: live-inject.mjs ~230 and live.mjs ~213. origin/main (b2f45bb, human-authored, merged) REWROTE the trailing justification to '-- pattern comes from the local .impeccable/live/config.json, not remote input'. This branch (0fe891a) DELETED the trailing prose entirely. Both sides edited the same line, so one form has to win. Note the asymmetry with 60cba74 on this same branch: there the prose was dropped BECAUSE a code guard now enforced the invariant. On live-inject.mjs and live.mjs no guard was added - the prose is simply gone, so a future reviewer must re-derive why the suppression is safe.

## Options

- Keep origin/main's rewritten justification - preserves a human's deliberate security annotation, but re-introduces unenforced prose the no-comments rule forbids
- Keep this branch's bare directive - rule-compliant and asserts nothing that can rot, but overwrites a human's same-line edit and leaves the safety argument underived
- Keep the bare directive AND add a code guard enforcing the invariant, mirroring 60cba74 - out of scope for this thread

## Outcome

Resolve toward the bare directive. The no-comments carve-out is explicit that a tool-required reason string stays at the minimum the tool demands, and 0038 already found the earlier justification on these exact lines to be FALSE - which is the precise failure mode the rule exists to prevent. Recorded because this overwrites a human's same-line edit: it is a one-line revert if the user prefers the annotation, and it is surfaced in the PR body rather than buried in a conflict resolution.
