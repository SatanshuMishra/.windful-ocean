---
Status: accepted
Date: 2026-08-21T01:36:46.404Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0653. An equivalent mutant is unclearable by wording under G14 block mode

## Context

All four pull requests this session BLOCKed on G14 and only G14, with valid receipts (red true, green true) and real gate runs of 59s, 100s and 136s - neither the roughly 11s false-G11 signature nor the roughly 130ms ladder short-circuit. The enforcer's BLOCK message ends "If a survivor is a genuine no-op (an equivalent mutant), say so in the PR", but verify.js:983-984 emits BLOCK under mode block and never scans the body. This repo also fixes a pull request title and body at creation, denying gh pr edit, so no receipt line can be added afterwards either. Two survivors on ship-plan.mjs:553 were confirmed equivalent by running all three variants over every manifest shape and orderedLength 0 to 4. receipts.config.json sets gates.G14.mode to block; the standard's own default is warn, stated at GATES.md:518-520 precisely because a survivor can be a genuine no-op.

## Options

- Change gates.G14.mode to warn in this repo, which would let a real survivor through unremarked
- Add a project-local exemption marker the enforcer would have to learn to read, inventing a mandate outside the standard
- Remove the mutable line so no mutant is generated, and file the exemption absence as a proposed gap against the standard
- Accept the block and downgrade every such change to unverified-reasoned

## Outcome

Remove the mutable line, and PROPOSE the gap rather than legislate it. For ship-plan.mjs:553 the meaningless 0 fallback becomes orderedLength, which is identical in every case once the line-552 guard has excluded orderedLength zero, and leaves no number for G14 to mutate. The absence of a per-survivor exemption under block mode is filed against receipts/gates@1.1 as a capability gap for the standard's owner; no project-local verification mandate is invented, per the closed-set rule. Recorded caveat: the enforcer source read was the local marketplace copy rather than the pinned c6127ba55f9a5669a95614639b08f5d49c3f228b, though the BLOCK strings matched character for character - marked unverified. Second recorded fact, because it makes a green meaningless: a test-only diff short-circuits receipts entirely (verify.js:496 excludes tests from changedSource), so the fix for these survivors must ship as a source-touching change or its PASS proves nothing.
