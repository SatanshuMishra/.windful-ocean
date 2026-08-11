---
Status: accepted
Date: 2026-08-11T20:54:46.597Z
Thread-Id: 01KZS8WH39NCYM3S8VRFQNJPNB
---

# 0347. The liveSha guard is design-rejected, so the cutover completes by retirement rather than a new guard

## Context

Supersedes 0346. That record concluded the defect was a missing liveness guard on rollbackCutover, and c3-c5 were scoped around building one. Reading the ratified design record reverses both of its premises.

The guard 0346 proposed is deliberately refused by design. 2026-08-08-cutover-control-file-invariants.md:132-133 states that binding rollback to journal.sha === liveSha "refuses every legitimate rollback after a subsequent promote", and that I3 deliberately does not bind to liveSha; re-ratified at 2026-08-09-cutover-invariants-v2.md:243. journal.sha keys the aside namespace and names the release the cutover pointed at (v2:233); it was never a claim about what is live. The invariant record names this exact guard as the over-strength trap that caught fix rounds 2, 3 and 4.

The decay premise was also false. The aside hooks/ and rules/ directories hold 26 and 2 symlinks into the live checkout plus a single real file, rules/context7.md, byte-identical to the blob from git show 75b90a3:.claude/rules/context7.md. Nothing is frozen, so "asides no longer correspond to live state" has no referent.

Separately, the bash gate returns no-opinion for node scripts/config/cutover.mjs rollback, proven by execution against the real hook with rm ~/.claude/CUTOVER as a verified ask control. guardpath (block-destructive-bash.sh:18) requires a literal .claude substring, which scripts/config/... lacks.

## Options

- Build the liveSha guard c3 asked for, treating the invariant documents as stale
- Strike c3, accept the forward path and lifecycle as designed, log the gate finding as an accepted risk, and complete the cutover by retiring the journal and its asides
- Leave the journal in place indefinitely and close the thread on documentation alone

## Outcome

Option 2. c3 is struck rather than satisfied: its premise has no referent and the guard it names is design-refused. c4 stands as designed - mergeJournal keeps carrying corroborated records forward, since it already refuses the dangerous shapes at cutover.mjs:404-417 and :418-429, and is unreachable anyway behind the unchanged early return at :710. c5 stands as designed - I3b ties consumption to disk emptiness rather than liveness, so no automated expiry is added to promote or converge, where deletion of the only record of preserved prior state would run unattended from a SessionStart or Stop hook. c6 is answered as a stated non-goal: threat-model Non-goal 3 (docs/security/bash-gate-threat-model.md:53) places script-mediated mutation out of scope, so it is logged as an accepted risk row rather than fixed, per the Bash Gate Exception in the security rule.

The cutover is completed by a one-time operator retirement of ~/.claude/.cutover/75b90a3.../ followed by ~/.claude/CUTOVER, in that order because the journal is the only index naming the asides. This is a deliberate act closing this migration, not a lifecycle change.

Rejected option 1 because building the guard would refuse every legitimate rollback after any promote - a worse failure than the one it claims to fix - and would restart precisely the fix-round churn the invariant record exists to stop. Rejected option 3 because it would keep an ungated, unindexed destructive affordance alive past the migration it existed to protect, with no remaining escape-hatch value now that the release indirection has survived two promotions.
