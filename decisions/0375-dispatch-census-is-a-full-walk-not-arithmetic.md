---
Status: accepted
Date: 2026-08-12T07:31:40.062Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0375. The dispatch census is corrected to 27 by a full walk, and future edits must re-walk rather than re-derive

## Context

SPEC section 1.1's headline claimed 24 of 38 dispatch sites (~63%) were mechanical, but its own breakdown table summed to 20 (5+13+2), and the conversion MSPs C3-C6 also accounted for exactly 20. One of the two numbers had to be wrong, and the figure is load-bearing evidence for the whole re-architecture. Rather than pick the internally consistent one, a codebase-analyst walked all 38 construction sites in mitosis.js.

## Options

- Change the headline to 20 (~53%) so it matches the existing table. Minimal edit and internally consistent, but writes a number the walk shows is wrong and leaves the table's enumeration incomplete.
- Keep 24 and add four unnamed sites to the table. Preserves the published figure, but the walk found no fourth class - 24 is provably 20 plus a double-count of the four trust dispatches.
- Adopt the walk's 27 (~71%), publish the full membership lists, and widen C3/C4/C6 to match. Larger edit and it grows the conversion scope, but it is the only figure that survives verification.
- Defer the whole question to the citation re-verification pass the SPEC already requires before admission.

## Outcome

Adopted 27 (~71%): b1=6, b2=18, b3=3, with full per-site membership lists published in the table. The 24 was 20 plus the same four trust dispatches (ci-diff, ci-publish-verify, ship-verify, prepare-probe) counted twice - they are a subset of b2, and 24/38=63.16% matches the published ~63% exactly, confirming the headline was computed from the double-count. The table separately undercounted by 7 real sites. C3 goes five to six, C4 thirteen to eighteen, C6 gains its second call site. Residual 9 makes the standing rule explicit: any future edit to that table re-walks the file, because the failure being corrected is a total that was reasoned about instead of counted. Deferring was rejected - the figure is quoted as evidence for the move, so a wrong number would carry the SPEC through review unchallenged.
