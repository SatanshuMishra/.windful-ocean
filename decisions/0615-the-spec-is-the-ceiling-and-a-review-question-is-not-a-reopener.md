---
Status: accepted
Date: 2026-08-19T02:56:54.137Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0615. The SPEC is the ceiling; a design review's own open question is not a licence to reopen it

## Context

The approved whole-solution design closes with a section titled "Open questions that need the user" listing six items. Four were put to the user. The user rejected the framing on the park-override item and named it as the same failure that has plagued this engine for three weeks: a SPEC is treated as a floor that any later LLM review can add to, rather than as a ceiling. The specific instance was self-evident once challenged - the design already states that it "lets an operator force one remediation attempt" on a needs-human park, so the behaviour was specified, and asking whether to keep it handed a settled decision back to the user as new work. This is the same mechanism as the earlier finding that acceptance lists were being read as floors, which is what made done unsatisfiable and stopped the work terminating.

## Options

- Answer each of the design's six open questions as a fresh decision, widening or narrowing scope per answer
- Treat the SPEC as the ceiling: build what it specifies, note inaccuracies, and halt rather than invent where it is silent

## Outcome

The SPEC is the ceiling. Three-way handling, binding for the rest of this thread and for every implementing agent dispatched from it. One: where the SPEC specifies a behaviour, it is built as specified and is not a question - the park override is therefore IN, as designed, with no further deliberation. Two: where the SPEC is silent or self-contradictory, the inaccuracy is noted in the unit's return and, if it blocks implementation, the agent STOPS and reports the unit not implementable rather than inventing a resolution. Three: where a review finds something above the ceiling, it is filed as a new item and never folded into the unit in hand. A "review found X" is never sufficient cause to widen a unit. The corollary that makes this operable: the design's own "open questions" section is retired as a scope surface - it is read as commentary, not as pending work. The one exception is a change the USER directs, which is a legitimate move of the ceiling by its owner; the unwatched-CI ruling recorded separately is exactly that, and is marked user-ratified so it is never mistaken for review-driven accretion.
