---
Status: accepted
Date: 2026-08-20T04:52:15.304Z
Thread-Id: 01M0ER53SRDPTZF6K6R1TTBZBH
---

# 0639. Extract the retired agent roster into tracked config rather than re-tracking the design document

## Context

One untracked design document turned out to be the only surviving record of which nine agent definitions had been retired, because those definition files were deleted earlier and tracked config held only the surviving thirteen. Three tracked consumers parsed that document: two tests and a CI gate. A pristine clone reproduced two test failures and gate exit 43. The user explicitly rejected re-tracking the document.

## Options

- Re-track that one design document as a named exception
- Add a frozen constant module beside the existing retired-lead constant
- Move the retired names into a tracked data file and declare the retained roster there too
- Move only the retired names into a tracked data file and derive the retained roster from the already-tracked agent-spec store

## Outcome

The last option. Re-tracking would have kept a design document doing config work, which is the exact confusion this thread set out to end. A constant module was rejected because the audit tool's source-of-truth flag is deliberately required with no default, so the retired-set source appears in the recorded command, and a module import puts no path in that command. Declaring the retained roster in the new file was rejected because the roster already exists in tracked form twice; a third hand-maintained copy is the pinned allowlist the project's own testing rule forbids, and it would turn adding a fourteenth agent into a red gate. Deriving retained from directory listing is the census form the rule requires, and it converted a cross-check that was empty by construction into one that fires.
