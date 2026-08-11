---
Status: accepted
Date: 2026-08-11T20:40:55.035Z
Thread-Id: 01KZS8WH39NCYM3S8VRFQNJPNB
---

# 0346. The CUTOVER defect is an unguarded restore path, not a wrong value in a file

## Context

Preflight gated this thread on one question: does the rollback path read CUTOVER? 0323 established that rollback reads release state, so a journal naming the wrong release could send a rollback to the wrong target. A code trace answers yes - but for a rollback 0323 never described.

There are two independent rollback verbs. promote.mjs rollback reads only ~/.claude/LIVE (promote.mjs:338) and is the one 0323 governs; CUTOVER appears zero times in promote.mjs or converge.mjs. cutover.mjs rollback calls rollbackCutover (cutover.mjs:954), whose sole input is the journal plus its aside container ~/.claude/.cutover/<journal-sha>/. It never calls liveSha, never reads LIVE, never resolves current. Corroboration (cutover.mjs:333-369) asks only whether each aside exists with the predicted node kind, so with the Aug-10 asides intact it passes and restorePreserved (cutover.mjs:814-821) unlinks each live ~/.claude/<name> and renames the aside back over it.

The consequence is not "the wrong release". Nine entries would become symlinks straight into the repo checkout, bypassing the release system entirely; hooks and rules would become real directories frozen on 2026-08-10. Neither 1ecacc7 nor 75b90a3. Nothing refuses, and the journal is then deleted. The apply early return is separately confirmed at cutover.mjs:710.

## Options

- Treat the journal's value as wrong and rewrite its sha to name the live release 1ecacc7
- Treat the defect as a missing liveness guard on an irreversible restore, and scope this thread around the guard rather than the file's contents
- Delete ~/.claude/CUTOVER and its aside container now, retiring the rollback affordance outright

## Outcome

Option 2. The defect is that an irreversible restore decides what to do from a record whose validity decays with every promotion, with no liveness check, no expiry and no refusal. The criteria are written against the guard, the forward path that carries a stale journal onward, and the affordance's lifecycle - not against the bytes in the file.

Rejected option 1 because the journal's sha keys the aside container, so it names the cutover event rather than claiming which release is live. Rewriting it to 1ecacc7 would point corroboration at a .cutover/1ecacc7.../ directory that does not exist, making rollback refuse for an accidental reason while destroying the legitimate restore path. The obvious fix is wrong on both counts, which is why c1 settles the field's meaning before anything is changed and c2 revisits the inherited claim that the file is WRONG.

Rejected option 3 because deleting the journal and its asides is itself the irreversible act, taken before the semantics are settled; whether the pre-cutover state stays restorable is exactly what c5 decides. The hazard is also not imminently reachable: cutover.mjs is absent from BOOTSTRAP_ENTRIES (paths.mjs:31) and from ~/.claude/local/, so no SessionStart or Stop hook can invoke it, and reaching it takes someone deliberately running the verb from the repo checkout.
