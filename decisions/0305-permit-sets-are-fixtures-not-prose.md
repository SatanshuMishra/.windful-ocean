---
Status: accepted
Date: 2026-08-09T20:47:43.656Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0305. A permit-set is a materialized falsifier fixture and never prose, because only a fact stored twice can drift

## Context

0301 gave an invariant four parts: domain, property, permit-set, witness. Ranking those four by remaining drift exposure shows the work is nearly done in two places and untouched in the other two.

Domain drift is solved: an invariant cites path:line and a constant name rather than retyping members, and the anchoring check verifies the citation resolves, is exported, and is not a shrunken subset. It fired live on B4 naming POLICY_LISTS and hand-listing 3 of its 4 members with BOUND_DENIALS omitted. Property drift is solved once a witness exists, because code cannot drift from code.

That leaves the permit-set as the one part still written as prose, and Q3 asks for exactly a permit-set amendment: I3a is over-strong and must admit the aborted-run pre-state, where the journal was written and the aside never created, which is the most likely real failure on this machine.

Landing that amendment as a sentence would move the drift surface up one level and make it harder to see. The next reviewer reads the sentence, checks it against the code, files the divergence, and a fix round closes it by tightening the code. That is the loop that consumed five rounds, and per 0301 rounds 2, 3 and 4 each shipped precisely that mistake.

Separately, the enforcement layer is not wired: invariant-shape-check.mjs runs but gates nothing.

## Options

- Every permit-set is a materialized pre-state asserted as PERMITTED, going red if someone tightens the code - ADOPTED
- Amend I3a in prose, as the round-6 artifact's wording implies - rejected, reproduces the drift it is meant to fix and hides it one level higher
- Tighten the code to match the over-strong sentence - rejected, would refuse the most likely real failure, which is what rounds 2, 3 and 4 each shipped
- Rely on review discipline to keep contract and code in sync - rejected, review samples rather than covers, per 0301

## Outcome

Drift is possible only for a fact stored in two places, so the guarantee is to store each fact once: every part of the contract becomes either a pointer into code or executable code, and prose that is neither is treated as the drift surface it is.

Permit-sets therefore become falsifier fixtures. The realistic pre-state is materialized and asserted PERMITTED, so "the contract permits the aborted-run case" stops being a claim a reviewer can contradict and becomes a test that goes red when someone tightens the code. This is the actual deliverable of the Q3 amendment; amending the sentence alone does not discharge it.

Two supporting guarantees are adopted with it. Wire invariant-shape-check.mjs into CI so a stale domain fails the build rather than waiting for a reviewer. And make UNWITNESSED_IDS a ratchet whose membership may only shrink, since nothing today stops the honest 17-of-17 waiver quietly growing back into a green signal.

Stated limit, recorded so it is not rediscovered as a gap: no mechanism can guarantee an invariant's English heading matches its body. That is why 0301 sends non-conforming statements out of the contract altogether. Part of this guarantee is achieved by having less prose available to drift, which makes the Q4 deletions load-bearing rather than housekeeping and is the reason they run early.
