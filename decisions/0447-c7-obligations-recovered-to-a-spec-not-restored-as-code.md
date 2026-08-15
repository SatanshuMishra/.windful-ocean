---
Status: accepted
Date: 2026-08-15T20:56:56.881Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0447. The deleted C7 obligation arrays are recovered into a spec, not restored as census code

## Context

Cutting the porting MSP that 0424 inserts before C7 needs C7's obligation list. Three of the five arrays that carried it are gone from the tree: 2087dd51 deleted PROMPT_C7_OBLIGATIONS and TRANSCRIPTION_C7_OBLIGATIONS, and 82a8d2fe, the tip of the C6 branch, deleted BOUNDARY_C7_OBLIGATIONS. Their host modules were census apparatus retired under 0439 when receipts/gates@1.1 replaced the bespoke census verbs. Seventeen obligations went with them as collateral; none was discharged. git grep for any of the three names against the current tree returns nothing, so the list survived only in git history.

## Options

- Leave them in history and resurrect on demand - rejected: the list is only recoverable by a reader who already knows which commit to look in, which is precisely what a fresh session lacks
- Restore the three arrays as a code module - rejected: re-adds a construct whose purpose is to verify other verification code, which receipts.md names as the symptom to watch for, and reverses 0439 without a decision to reverse it
- Recover the text verbatim into a spec document - chosen

## Outcome

All twenty-six obligations are recorded in .claude/docs/specs/2026-08-15-mitosis-porting-msp-scope.md, with the seventeen that survive only in history reproduced verbatim and each cluster carrying the commit it is recoverable from. The porting MSP is cut against that list: twenty-four obligations drain into it, C7 keeps the tick loop and the redispatch classification. The split is proposed rather than ratified, and carries four open questions, chief among them that no surviving artifact records which two prompt obligations were the deferred security HIGHs. Shipped as PR #125.
