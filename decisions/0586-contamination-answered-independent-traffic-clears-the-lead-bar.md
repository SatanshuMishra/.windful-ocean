---
Status: accepted
Date: 2026-08-18T19:35:42.369Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0586. Contamination answered by measurement: independent out-of-repo traffic clears the Lead bar alone

## Context

Decision 0584 reserved a judgement for the human: whether a window whose majority is the audit's own delivery-lead dispatches can evidence routing in real use at all. Rather than put a taste question to the user, the concern was converted into a measurable test - does traffic ORIGINATING OUTSIDE this repository, and therefore free of the instruction that named a Lead in this session, clear the bar on its own. The field is cwd, present on every row, 100 percent populated across all 3112 snapshot rows and single-valued within all 981 in-window dispatch groups, so no proxy was needed. Split at dispatch grain over the grown window, n = 27: this repository 13 of 13 Lead, its .claude/agents subdirectory 2 of 2, the second project 9 of 12. The in-repository 15 of 15 at 100 percent is exactly the shape an audit explicitly instructed to use a Lead would produce, which is the concern stated as a number rather than dismissed. The earlier n=21 reading was reproduced exactly, confirming identical methodology; its two directory labels were transposed, which is corrected here.

## Options

- Put the contamination question to the user as a judgement call, as 0584 reserved it
- Convert it into a measurable test and let the out-of-repository subset decide
- Discard the in-repository dispatches and re-grade on the remainder alone
- Treat the whole window as unusable and hold the Lead-share clause unmeasured

## Outcome

The Lead-share clause of c5 is MET, and the contamination concern is ANSWERED rather than waived. Out-of-repository traffic, independent of this session's Lead-naming instruction, clears the bar on its own at 9 of 12 = 75 percent against the pinned 50 percent. The combined window is 24 of 27 = 88.89 percent at n = 27, above the minimum of 20 pinned in 0579, so the criterion is satisfied on its pinned definition. Three honesty caveats are recorded rather than buried. At n = 12 the out-of-repository Wilson interval is 46.8 to 91.1 percent, so the point estimate clears 50 percent while the interval does not exclude it. The log carries no dispatch description, so "independent of the instruction in this repository" is established while "unprompted" is not. And researcher recorded ZERO dispatches in every directory, so the share rests on three of the four Leads. This resolves the judgement 0584 reserved for the human, on measurement rather than preference, and the user may overturn it. It does NOT close c5, whose attribution and outcome clauses remain unmet.
