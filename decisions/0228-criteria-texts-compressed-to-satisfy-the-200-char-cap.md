---
Status: accepted
Date: 2026-08-04T06:03:15.491Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0228. The seven completion criteria are compressed to fit the 200-char cap, meaning preserved, none struck

## Context

This thread's seven completion criteria were authored under a looser schema and each exceeds the ledger's current 200-character cap. update_thread revalidates the whole thread, so every spine write is refused on data the write never touched, leaving the roster's next step stale and actively misleading. amend_criteria can rewrite them but demands a decision_ref, so a decision must exist before the unblock.

## Options

- Leave the criteria as authored and accept a permanently stale spine; Compress each criterion to 200 chars preserving meaning and Definition-of-Done force; Strike the over-cap criteria and re-insert shorter replacements; Point the rewrite at an unrelated existing decision number to satisfy the validator

## Outcome

COMPRESS, preserving meaning. Each of the seven is rewritten to at most 200 characters with its substance and its Definition-of-Done force intact: no criterion is struck, none is weakened, none is added. This is a SCHEMA MIGRATION, not a redefinition of done - the ledger rule that criteria are fixed at thread creation governs their MEANING, and that meaning is unchanged. Rejected leaving them as authored: a stale spine is already measurably harmful, since the roster still directs a fresh session to re-run a precondition audit that is complete and adversarially verified, costing roughly two hours and 3M tokens for answers already in hand. Rejected strike-and-reinsert: strike is for criteria that no longer apply, and retiring seven live criteria to work around a character limit would misrepresent the thread's Definition of Done. Rejected borrowing an unrelated decision number: it would attribute a criteria rewrite to a decision that never authorised it, falsifying the ledger to make a write succeed.
