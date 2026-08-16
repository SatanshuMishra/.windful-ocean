---
Status: accepted
Date: 2026-08-16T03:57:08.581Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0454. D1 widens past its SPEC acceptance to close the cli.mjs argument contract gap

## Context

The SPEC scopes D1 to two edits: SKILL.md invokes node .claude/lib/mitosis/cli.mjs via Bash instead of calling Workflow, and block-inline-engine.mjs additionally refuses a Workflow call naming mitosis.js while permitting the CLI. Its acceptance is a hook test proving the CLI path is permitted and both Workflow paths refused, plus removal of the workflows-enabled precondition. Orientation before dispatch found a gap that acceptance does not cover: cli.mjs reads --spec --run-id --at --repo-root --journal --repo-slug --integration-branch and an optional --window, and parses the spec as a JSON document carrying specs and manifest - an already-decomposed unit table. SKILL.md collects a markdown spec path plus verify, build, models, worktreeRoot, fixLoopMax, baseBranch and sourcePrefix. Swapping the invocation alone therefore produces a skill whose one dispatch cannot execute, which satisfies the written acceptance while leaving the entry point non-functional.

## Options

- Ship the written acceptance and file the contract gap as a new item for D2 or a fresh MSP, per G0 acceptance-as-a-ceiling
- Widen D1 to reconcile SKILL.md's collected inputs with the flags cli.mjs actually reads, so the invocation is genuinely runnable
- Investigate only and return without editing, deferring the ruling

## Outcome

Widen D1. The user ruled that D1 also reconciles SKILL.md's collected inputs with cli.mjs's argument contract, accepting the larger diff and the re-estimate against a bar different from the one the SPEC declared. The widened criterion is the new ceiling for D1: anything found above it is still filed as a new item and never folded in. Recorded here because the SPEC's own D1 acceptance text no longer describes what D1 ships, and a later reader comparing the diff to section 5 D1 would otherwise read the difference as scope creep rather than a ruling.
