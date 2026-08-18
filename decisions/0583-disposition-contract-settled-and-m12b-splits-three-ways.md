---
Status: accepted
Date: 2026-08-18T19:20:44.321Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0583. The disposition contract throws at construction, and the deletion unit splits three ways

## Context

M1 shipped the unit-state lattice but its lead refused to let a maker invent the createDisposition field-validation contract, and it pinned two export names the design never stated. Separately M12a proved three source-text censuses pin run-engine.mjs to its filename, making the design's M12b file list and size estimate wrong. Six later units inherit all of this, so it had to be settled before M2 started rather than after.

## Options

- Let the M2 implementer infer the disposition contract from the field names
- Have the architect settle the contract, confirm the API surface, and re-cut M12b before M2 starts
- Defer the contract until M9 needs it and let park write whatever shape it likes

## Outcome

The architect settled all three into a binding Part 7 that governs where it conflicts with the document body. CONTRACT: validation throws at construction, matching every neighbouring constructor. Only class is required. diagnosis, stage, resumePoint and triedSet are nullable or defaulted, because today's paths hardcode null and forcing invented values would reintroduce the literal-standing-in-for-a-measurement defect the design exists to remove. triedSet rejects a non-array, killing the silent spread that turns a string into its characters. remediation is FORBIDDEN at construction and throws if supplied - M9 adds it through a separate withRemediation returning a new frozen object, so a park claiming it was remediated before remediation ran is unrepresentable. API CONFIRMED as M1 shipped it: mergeProgress, legacyProgress, DISPOSITION_CLASSES, createDisposition, plus withRemediation later. CEILING CLARIFIED: the 400-line cap binds added and modified lines only, never deletions, because it is a review-surface limit and a pure deletion presents no new lines for a defect to hide in. M12b therefore splits three ways - M12b-1 decouples the surviving censuses in wave 2, M12b-2 deletes run-engine.mjs and its importers, M12b-3 takes the rest, the last two mutually parallel in wave 5. The importer count is five files, not the seven M12a reported; ten files match the name and four merely mention it. RULING on the three censuses: they are change-detectors, but the defect is hardcoding one path rather than reading source text at all - determinism-lint and no-self-merge-consent read source legitimately by enumerating a directory and halting on the unclassifiable. Where the subject dies the census dies with it inside M12b; rewriting the surviving path-pinned ones is filed above the ceiling.
