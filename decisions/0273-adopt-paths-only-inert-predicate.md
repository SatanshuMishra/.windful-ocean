---
Status: accepted
Date: 2026-08-06T21:14:15.348Z
Thread-Id: 01KZCAGBAH55F8AR1ZXJQT8JRP
---

# 0273. Adopt the registry-declared inert predicate, paths-only, with M3/M4/M5 structurally barred from carrying it

## Context

0272 measured the tax as linear and unbounded: 76,292 tokens fixed plus 2,298 per row, reaching 47.5 percent of a low-risk PR's budget at 30 ids. It also established that the assurance bought is partly ceremonial - CI proves a verdict EXISTS and never that it is true - and that two independent runs of the same change disagreed on 2 of 17 verdicts. Resolution ordered on robustness first, then simplicity, per the Three Pillars. This is a solo owner-held repo, so no resolution may lean on a second reviewer.

## Options

- A - change nothing, keep total coverage: rejected, its totality is largely unverified and its failure mode (prose thinning across every PR, invisible by construction) is unbounded and already measurably underway, calls-per-row 4.50 to 1.12
- B-plain - the c3 draft, inert_when optional with always-prose for M3/M4/M5 by convention: rejected, convention is not a guard; a later inert_when on M4 would silently delete the only mechanism that caught the mp3 regression
- B-hardened - inert_when {paths} only, M3/M4/M5 structurally rejected, checker generates the inert row's check text: ADOPTED
- C - B plus absent_tokens regex over diff content: rejected, changes the 14/3 split not at all for this registry while adding a second matcher that can be silently wrong
- D - tiering or a standing verdict a change must rebut: rejected in c1, silence becomes a pass and the N+1th path is silent by construction, failing M2

## Outcome

Adopt B-hardened. A registry entry may carry inert_when {paths: [glob]}. A row may then declare basis inert instead of prose, and the checker PROVES it against the diff it already computes; the basis holds only if EVERY changed path matches a declared-inert glob, so an unenumerated path falsifies it and forces prose. The predicate is a property of the INVARIANT, never of the change, which is why this is not the self-selected allowlist M2 forbids. Two hardenings the measurement earned. First, M3, M4 and M5 are STRUCTURALLY rejected if they carry inert_when, rather than being prose by the convention of an absent field: the mp3 duration regression was caught only because M4 forced a look, and in a solo repo nothing would notice that catch disappearing. Second, the checker WRITES each inert row's check text, naming the paths it evaluated and the glob that matched, so an over-broad glob leaves a trace in the artifact instead of hiding behind the word inert - the only audit mechanism available without a second reviewer. absent_tokens is dropped. Effect: 14 of 17 rows become CI-proved facts, 3 stay human prose, per-PR cost falls to about 83,200 tokens and becomes O(judgment ids) rather than O(registry size), so growth in the declarable class is free. This RAISES the assurance floor rather than lowering it. What it gives up, explicitly: per-change reconsideration of the 14 declarable ids, so an invariant whose real threat surface drifts beyond its declared paths goes silently inert; correctness moves to glob authorship, less frequent but higher stakes and unreviewed here; the serendipity of totality, which is measured rather than hypothetical since being forced to look is what found the halved sounds, preserved now only for M3, M4 and M5; and push mode changes behavior when no base resolves, since an inert basis cannot be evaluated without a diff and must then fail loudly, a live change from what 0264 shipped.
