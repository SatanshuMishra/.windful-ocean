---
Status: accepted
Date: 2026-08-17T16:35:30.943Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0529. The decompose boundary cannot represent no-work, so a junk spec yields a fabricated dispatchable unit

## Context

Six live decompose-emit runs with real model children produced three findings. First, DECOMPOSE_SCHEMA sets minItems 1, so an empty decomposition is unrepresentable. Fed prose naming no file and no change, the decomposer invented an MSP titled halt-spec-not-decomposable, exit 0, schema valid. prompt-plan.mjs:16-27 contains no non-decomposable instruction, no sentinel and no halt convention, and a grep of the lib finds no engine special-casing, so the id is pure improvisation that no code recognises. It passes coarseScopeWarnings on an empty edit set, clusters as an ordinary singleton, and reaches writeRunDocument as a dispatch-ready implementer prompt. Second, three runs of identical input gave 4, 4 and 3 MSPs, the last dropping a unit entirely. Third, the pinned expectations assumed a greenfield substrate while the repo already implemented clamp and chunk, so two reclassifications graded FAIL against a pin that was wrong about the world.

## Options

- Grade all three parallel runs as engine failures and ignore the pin's greenfield error
- Separate the pin's own defect from the engine's, file each honestly, and fix neither in flight
- Loosen the pinned expectations to match what the decomposer produced

## Outcome

Separate the three and file each. The pin's greenfield assumption is a TEST-DESIGN defect owned by this work, recorded rather than repaired by widening the criterion after the fact, since adjusting a pin to match output is exactly what the ceiling rule forbids. Run 3's collapse is a genuine defect independent of the pin, established by the fact that the same already-implemented condition produced a retained coverage unit for one module and a dropped unit for another inside one decomposition, while both genuinely-new functions decomposed identically in all three runs. The minItems 1 constraint is filed as the most serious of the three, because it makes no-work unrepresentable and thereby manufactures a dispatchable unit from an empty spec; any fix must give the boundary an explicit empty or halt outcome rather than relying on prose in an invented title.
