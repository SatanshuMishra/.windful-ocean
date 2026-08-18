---
Status: accepted
Date: 2026-08-18T02:16:11.207Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0557. The shipped-store test becomes filesystem-derived and byte-identical across all five branches

## Context

The substrate shipped a characterization test in agent-generate.test.mjs asserting that the shipped spec store is empty today and that --check is clean over it. That assertion is true only while the store holds zero specs, and populating the store is precisely what every wave unit does. U5.1 measured the consequence exactly: its branch was already RED on that test at its own tip 63d2086d, before any merge and before any conversion. All four wave agents independently hit it and all four rewrote it, each in different words - U4.1 as clean over it against the roster it generates, U4.2 as clean over the shipped store and the bodies it ships, U5.1 as the populated store composing against the shipped agents directory, U5.2 as every spec it holds matching the shipped body generated from it. Measured divergence between two of them is two insertions and two deletions on the same hunk. This overturns the disjointness half of 0556: the file overlap does not exist in the pre-merge branch diffs, it is CREATED by the substrate merge, because the substrate contributed a test whose truth depends on store state. The merge consequence is concrete: the first wave PR into main merges clean, and the second, third and fourth each conflict on that hunk because both sides changed the same lines relative to the substrate base.

## Options

- Leave the four rewrites divergent and hand-resolve three conflicts during the merge round
- Harmonise one byte-identical filesystem-derived assertion across the substrate and all four wave branches
- Pin the expected spec count per branch
- Delete the shipped-store test and keep only the temp-directory empty-store coverage

## Outcome

One byte-identical assertion, written into the substrate and all four wave branches. It derives the expected spec count by reading the store directory rather than carrying a literal, so it is true on the substrate where the store is empty and on every wave branch whatever it adds, and it cross-checks the generator's own reported count against the filesystem instead of restating it. Byte-identity is the mechanism, not a tidiness preference: git auto-resolves when both sides make the SAME change, so three conflicts stop existing rather than being resolved three times under merge-round pressure - in the one file whose job is proving the generator is not vacuously passing, which is the worst possible place to hand-resolve. Pinning a per-branch count was rejected outright: testing.md forbids a pinned count as a change-detector wearing a census costume, and it would redden the moment a later unit adds a spec. Deleting the test was rejected because the populated-store path would then have no home at all; the empty-store vacuity case keeps its separate temp-directory coverage either way, which is what lets the harmonised assertion stay honest when the store is empty. Leaving the divergence was rejected as trading a bounded mechanical edit now for three unbounded manual resolutions later. Note the underlying defect for the record: the original assertion passed on each wave branch before conversion only because the .spec.mjs files were invisible to the JSON loader, so it was a false green before it was a red.
