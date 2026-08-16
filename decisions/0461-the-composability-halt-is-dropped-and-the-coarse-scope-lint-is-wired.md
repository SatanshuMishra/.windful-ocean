---
Status: accepted
Date: 2026-08-16T06:23:36.277Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0461. The PR-composability halt is dropped and the coarse-scope lint is wired into the OS-process path

## Context

Two checks live only in mitosis.js and the SPEC's D2 section is silent on both — neither is named, ported, dropped or deferred anywhere in it. Both are unreachable on the OS-process path today: the import closure from cli.mjs, decompose-emit.mjs and engine.mjs contains no reference to workflows/mitosis.js. The PR-composability halt (prComposable at mitosis.js:3745-3748, halt at :4454-4457) is subsumed three times over: decompose-schema.mjs:41-45 constrains changeType, scope, title and rationale per field so the worst-case composed title is 68 characters against the 72 cap and the terminal character class already excludes trailing space and period; pr.mjs:155-156 rejects a bad title at creation; receipts.yml:58 rechecks in CI. Its one non-duplicated behavior is PR_VALUE_SHELL banning dollar, backtick and backslash, which existed because mitosis.js interpolated those values into a shell command string; pr.mjs is argv-only via spawnSync with no shell option. The coarse-scope lint is different: an initial analysis reported it absent from lib, which was wrong. lintCoarseScope exists at run-engine.mjs:159 with COARSE_SCOPE_FILE_THRESHOLD at :88 and eleven test cases, but its only production caller is mitosis.js:4478. prompt-plan.mjs:25 tells the decomposer a deterministic post-derivation lint flags suspiciously coarse scopes — a claim that becomes false the moment that caller is deleted.

## Options

- Drop both checks and let them die with mitosis.js
- Carry both, lifting the composability guard and wiring the lint
- Drop the composability halt, wire the existing lintCoarseScope into decompose-emit.mjs

## Outcome

Drop the composability halt, carrying no code; the shell-metacharacter ban is filed as ceiling item F4, to be restored as a test inside pr-format.mjs's inertValue only if a future path re-introduces string interpolation. Wire lintCoarseScope into decompose-emit.mjs on the fresh-decompose path, warn-only and surfaced on stderr, so prompt-plan.mjs:25 stops being a false claim to the decomposer. decompose-emit.mjs must NOT import run-engine.mjs — that would create an import edge from the new architecture into the legacy engine, which is what this stack exists to remove — so the lint and its glob dependencies move to a module that survives the deletion MSP. The distinction that decides both: a check with three surviving enforcement layers is redundant, while a check with none whose absence is actively misrepresented to the decomposer is a live defect.
