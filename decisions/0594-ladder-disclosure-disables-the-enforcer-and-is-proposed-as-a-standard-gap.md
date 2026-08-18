---
Status: accepted
Date: 2026-08-18T22:15:30.280Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0594. An honest ladder disclosure disables the enforcer, so the gap is proposed against the standard rather than patched here

## Context

The receipts enforcer matches its configured downgrade tags as TEXT anywhere in a pull request body and then short-circuits past all eight re-run gates, G14 included. All four ladder tags do this, not only reverted. Confirmed in both directions: PR 215 wrote "then reverted" in its inertness receipt and the check returned PASS in 129ms, while PR 221 deliberately withheld every ladder status from its body and the same check ran a genuine 67 seconds. The project had already hit this once and excluded the fixed tag for exactly this reason, leaving the other three in place.

## Options

- Remove the remaining tags from downgrade_tags, which strips three legitimate ladder statuses
- Rename the configured tokens to strings unlikely to appear in prose
- Keep ladder statuses out of the pull request body entirely and propose the gap against the standard
- Accept ungated pull requests for the rest of the stack

## Outcome

Adopted the convention and refused the local patch. Ladder statuses go to the orchestrator IN FULL and never into a pull request title or body; the orchestrator records them in the ledger. Renaming the tokens was rejected because it only moves the collision, and deleting them was rejected because it strips three legitimate ladder statuses. THE APPARENT CONFLICT WITH THE HONESTY RULE IS NOT REAL, and leads kept tripping on it: --not-verified "<thing> - not run" is the honesty rule's own vocabulary, is not a ladder tag, does not short-circuit the enforcer, and stays MANDATORY for any unrun check - so a body can be both honest and enforced. Elapsed time is the tell, since a sub-second PASS means nothing was checked. THE GAP IS PROPOSED AGAINST receipts/gates@1.1 FOR THE USER TO RAISE, never legislated here: tag detection is textual over the body, so an honest ladder disclosure disables the enforcer that would have checked it, and the incentive runs backwards from the ladder's whole purpose. The remedy is structural detection through a dedicated field or trailer and belongs in the standard, not in this repository. Separately the architect corrected its own importer inventory from five to EIGHT files after its grep was piped through a line-oriented filter that showed only the closing brace of a multi-line import - the third short inventory in this programme, after raw-text pins and reader-side references - so every remaining unit matches the import specifier rather than the line containing it, and lets its own acceptance census prove the inventory. M12c is added at wave 3 to import the risk-marker vocabulary rather than restate it, deleting the divergence instead of detecting it and retiring the census leg M12b-1 just built. Stack reaches twenty-two units.
