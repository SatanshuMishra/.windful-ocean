---
Status: accepted
Date: 2026-08-19T20:23:06.721Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0627. User-ratified: M17's acceptance retargets from the literal census to the read census

## Context

M17's lead built the A6 census to the letter and stopped on a named condition rather than shipping. Two measured defects in the ceiling, both reviewer-confirmed. First, the eight A6 rules do not span their own domain: 45 of the 75 closed-set literals in production source occupy syntactic roles no rule covers, so "halts on nothing" needs either a ninth rule or an exemption, and both are forbidden. The most generous honest stretch rescues 4 of 45. Second and worse, the census is keyed on string literals, and three mirror writes carry no literal at all - recovery.mjs:147, recovery.mjs:194 and run-log.mjs:92-96 all write status: legacyStatusOf(progress), a call expression, with run-log's real writes in shorthand-property form. The census returns neither classified nor halted for them: it never sees them. So "zero manifest-status-legacy occurrences" is reachable with the mirror fully standing, and a green there would be the exact false green this stack exists to kill. Two further vacuities were measured: manifest-progress is already 0 on the unmodified parent, and disposition-class is 0 by construction because DISPOSITION_CLASSES shares no member with the eight tokens.

## Options

- Retarget acceptance to tests/property-read-census.mjs, which closes over .status reads and does see all three mirror writes
- Drop M17 and leave the legacy mirror on main, since nothing downstream depends on the contraction
- Delete the mirror anyway under a speculative and an unverified-reasoned downgrade
- Add a ninth classification rule so the literal census can clear its own ceiling

## Outcome

The user moved the ceiling, so this is owner ratification and not review accretion. M17's acceptance becomes the read census tests/property-read-census.mjs and its reportLegacyStatusReads, which sees all three mirror writes and can therefore actually fail. The "halts on nothing" clause is dropped and the vacuous manifest-progress clause with it. The literal census stays committed as a reported diagnostic artifact rather than a gate. Two consequences the orchestrator ruled in the same exchange: run-log.mjs joins M17's file set, because deleting legacyStatusOf orphans its call site there and the original list was derived from writers rather than readers - the same A8 shape that created M4b; and if keeping the literal census committed would require either a pinned count or a dead-code exemption, the lead reports rather than inventing, and it is dropped instead.
