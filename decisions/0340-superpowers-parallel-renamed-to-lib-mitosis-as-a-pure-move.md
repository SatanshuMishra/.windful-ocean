---
Status: accepted
Date: 2026-08-11T18:53:21.338Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0340. The stale superpowers-parallel tree is renamed to lib/mitosis as a pure move before the SPEC

## Context

.claude/lib/superpowers-parallel/ holds 38 .mjs files (5,247 lines). Exactly one - resolve-superpowers.mjs - has anything to do with the vendored Superpowers plugin; the other 37 are the mitosis engine. The directory is named after its smallest integration shim rather than its dominant contents. The same pattern appears at larger scale in .claude/docs/superpowers/ (58 files, only 20 mitosis-titled), which is the project's general specs/plans archive wearing a plugin's name and duplicating the already-existing docs/plans and docs/specs hierarchies. An audit enumerated the blast radius exhaustively: 17 load-bearing path strings across 12 files, including the superpowers-drift-check.sh:6 hook registered at settings.json:139, the CI phase-parity step at test.yml:22, the npm test glob at package.json:8, three imports in the mandated PR tool lib/git/pr.mjs:4-6, a SELF-REFERENTIAL hardcoded string at resolve-superpowers.mjs:79 that will not follow its own rename, and mitosis.js:23's LIB_DIR, which is interpolated into subagent prompts so a stale value produces an agent confidently running a 404ing command. The release machinery names no subdirectory - paths.mjs:18-29 promotes `lib` whole and the guard hooks match on top-level entry name only - so an ordinary release plus cutover suffices, with no change to promote.mjs or cutover.mjs. No orphan directories or files were found anywhere in .claude.

## Options

- Rename now as a pure move, before the SPEC is written - chosen
- Rename as part of the rebuild, letting it ride along
- Leave the name and accept the mismatch
- Rename and subdivide lib/mitosis in one change

## Outcome

lib/superpowers-parallel -> lib/mitosis; resolve-superpowers.mjs -> superpowers-prompts.mjs; docs/superpowers/{specs,plans} merged into the existing docs/{specs,plans}; workflows/parallel-plan-execution.js -> mitosis-execute.js together with its meta.name, which is how the Workflow tool addresses it. The principle: name a DIRECTORY for its dominant contents and a FILE for its integration. All 17 load-bearing string sites change in the SAME commit, or the new release ships with dangling paths the moment cutover flips. The dead .gitignore:34 line is deleted rather than renamed - it names a path nothing writes, since the hook actually writes to ~/.claude/state/superpowers-drift-state.json. PHASE 2 - subdividing lib/mitosis into engine/recovery/git/gates - is DEFERRED until after the rebuild lands, because 0325's Node host makes workflow-sandbox.mjs, the ~25 inline twins in mitosis.js and mirror-guard.test.mjs all moot; renaming files scheduled for deletion is waste. Sequenced BEFORE the SPEC is written, so the SPEC cites live paths rather than baking a stale name into the document that supersedes SPEC B. Executed on its own branch as a pure rename with zero behavioural change, NOT in this thread, whose criteria forbid implementation. Reconciling the second, diverged root-level docs/superpowers/ tree (16 files, not a mirror) is separate work - it is a content merge, not a move, and mixing it in would violate atomic-commit discipline.
