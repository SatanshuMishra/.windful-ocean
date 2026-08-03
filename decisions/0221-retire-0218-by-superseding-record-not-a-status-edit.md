---
Status: accepted
Date: 2026-08-03T15:46:47.937Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0221. Retire 0218 with a superseding record, because no sanctioned path edits a decision in place

## Context

0219 states in its body that it supersedes 0218, but 0218's own Status line still reads accepted, so a reader who opens 0218 alone sees an accepted record whose two live paths (provision a write-but-not-admin machine user; do not run mitosis on owner-held repos) were both withdrawn. The continuity rule permits exactly one post-acceptance mutation, the Status line. That mutation turns out to have no execution path: the ledger MCP surface exposes create-only record_decision, plus update_thread, transition_thread, append_session_event, archive_thread, reopen and create_successor, and none patches the frontmatter or body of an existing decision. 0202 independently ratified that ledger decisions are git read-only, so hand-editing the _ledger ref is not a sanctioned substitute. The user ruled the bookkeeping non-critical and offered two shapes: a superseding record, or removing 0218 entirely.

## Options

- Flip 0218's Status line in place - the continuity rule's nominal path, but not executable: no tool patches an existing record, and 0202 forbids the manual git edit that would force it
- Delete 0218 entirely - also has no tool path, and destroys the reasoning trail explaining why the machine-user option was ever weighed, which is the context that makes 0219's refutation legible
- Record a new superseding decision - executable through record_decision, append-only, and consistent with the write-once ethic that reversals create a new record rather than rewriting an old one

## Outcome

SUPERSEDING RECORD. This record retires 0218: both of its live paths are withdrawn by 0219, which refuted the premise they rested on rather than choosing between them. Deletion is rejected on the same ground the write-once rule exists for - 0218 documents a genuine investigation, and a future reader needs it to understand why a machine-user account was ever on the table before 0219 established that mitosis contains zero merge invocations. The stale accepted Status on 0218 is accepted as a known cosmetic defect rather than forced by an unsanctioned git write; this record plus 0219's body carry the supersession, and the thread spine lists all three in order. Standing consequence for the tooling: an in-place status patch is a real gap in the ledger MCP surface, since the continuity rule specifies a mutation the server cannot perform. Recorded as an observation, not scheduled as work.
