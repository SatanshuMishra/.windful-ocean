---
Status: accepted
Date: 2026-08-13T02:35:32.070Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0386. A new standalone lib module earns dead-export liveness by a real CLI in its own file, never by a wider surface

## Context

dead-export-lint fails any named export with zero live callers outside its own literal text, and tests do not count. Measured against the base, every identifier A2, A3 and B1 planned to export had zero occurrences repo-wide, so all three would have shipped red while SPEC 4.1 requires each MSP to be independently green and neither A2's nor A3's Files line admits a consumer edit. A1 passed the gate only because "dispatch" is a common enough word to collide raw in four sibling modules — an accident, not a pattern. Settled once, before the three lanes fanned out.

## Options

- Wire a real cross-MSP consumer now - rejected for A2/A3: they are siblings depending only on A1, so cross-wiring serializes them and destroys the parallelism
- Inline a twin of each new module into mitosis.js and classify it WHOLE - rejected: adds twins to the file SPEC 4.3 deletes at D2 and forces a genuine three-way collision on mitosis.js
- Amend dead-export-lint to recognise a not-yet-wired class - rejected: any name-based exemption is a sampled allowlist, forbidden as a change-detector wearing a census costume
- A real CLI entrypoint in the module's own file calling every named export - chosen

## Outcome

Every named export of a new standalone lib module must be reached by executable non-test JavaScript inside that MSP's own declared file set. Preferred path is a SPEC-mandated sibling consumer; otherwise the module carries a real CLI entrypoint in its own file behind the house guard at wave-planner.mjs:87, with a usage string, non-zero exit on misuse, and at least one test spawning it as a real subprocess. Export surfaces stay narrow by returning frozen handle objects whose methods are properties rather than named exports. Four things are forbidden, each independently a failed MSP: the export-list form, which EXPORT_DECL cannot see and which would be gaming rather than compliance; choosing an export name for a common-word collision; manufacturing liveness from a string or comment in a sibling; and editing dead-export-lint.test.mjs or adding an inline twin to mitosis.js. The remedy introduced no new shared file — the only shared edit remains the one MIRROR_CENSUS row each MSP already owed.
