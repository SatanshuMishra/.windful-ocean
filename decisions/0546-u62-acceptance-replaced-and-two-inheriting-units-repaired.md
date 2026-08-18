---
Status: accepted
Date: 2026-08-18T00:44:05.291Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0546. U6.2 gets a grammar-free retirement census; U6.1 and U7.1 are repaired with it

## Context

Decision 0532 filed the census grammar gap against U6.2 and found its acceptance already green with every retiring reference in place. Measurement against the live repository found the defect is two defects. First, the U1.2 census resolves in one direction only - every referenced name must resolve to a definition present on disk - and at U6.2's parent all nine retiring definitions still are, so the criterion is green before the unit and after it and has no failing state. Second, the instrument is blind: the code-span-plus-role-noun grammar detects 5 of 19 real reference sites, 26 percent, and the census self-attests this at name-integrity-census.mjs:12. The blindness is broader than 0532 recorded - bold emphasis is not a code span at all, a comma list captures only its final item, and any intervening word breaks the match. Separately, U6.2's deliverable list is incomplete: report/SKILL.md carries four report-writer sites where the list names one, and explain-my-config/references/pipeline-narrative.md carries two sites and is not named at all.

## Options

- Widen the U1.2 census grammar and keep the existing acceptance wording
- Replace the acceptance with a grammar-free retirement census over the nine known literals, resolving against the target roster
- Split U6.2 into a mechanism unit and a repoint unit so the widened check is observed failing before use
- Leave U6.2 and let U7.1's git grep clause catch the residue two waves later

## Outcome

The acceptance is withdrawn and replaced by a standalone declaration at .claude/docs/specs/2026-08-17-u62-acceptance.md, following the U3.3 precedent. The instrument is a new grammar-free retirement census: the retiring set is nine known literal strings, so a census over a known token set has nothing to be blind to and no grammar is needed. The bar is ZERO occurrences with no descriptive-versus-routing classification, deliberately, because a classification step is a place to relabel an inconvenient site rather than fix it. The retiring set is derived two ways from SPEC section 5b - the roster table minus the thirteen, and the explicit deleted-nine line - which must agree, plus a closure assertion that every on-disk agent is in exactly one of the two sets. Derivation by lacking a generator spec was rejected: it reads as more independent but is unrunnable before wave 5 and would halt the census at exactly the moment it is most needed. The split into two units was rejected because the raw scan is grammar-independent ground truth, which closes the vacuity risk inside one unit. Two more units carried the same defect family and are repaired in the same change: U6.1's inertness was conditioned on U7.1 landing two waves later and could not be run at its own time, and U7.1 named the same blind census and would have gone green with thirteen live references in place. The general grammar gap is filed above the ceiling, not folded in.
