---
name: verification-discipline
description: Auto-loads on completion-language phrases ("done", "ready", "verify", "before commit", "ship", "complete"). Enforces evidence-before-claims discipline scaled to change size. For projects with /verify-<project> commands, uses the scoped command; for others, the lightest sufficient checks. Never runs the full pipeline as a default.
---

# Verification Discipline

Evidence before claims, sized to the change.

## Rule

Breadth is sized to the change, and it widens one rung at a time.

- Trivial change -> typecheck plus scoped lint on the touched files.
- Domain-bounded change -> scoped run against the touched paths.
- Cross-cutting change -> scoped run against every touched path, then widen to the affected packages or suites. Widening is done one rung at a time, and each rung is justified by a failure the narrower rung could not have caught. "Cross-cutting" is not a licence to run everything.
- Pre-push, or explicitly requested -> full pipeline.

## Implementation

When invoked:

1. Determine the touched files (`git diff --name-only` against the base).
2. Run the first of these that exists, and stop there:
   - the project's `/verify-<project> <scope>` (look for `<project>/.claude/commands/verify-*.md`);
   - a scoped script the project already defines in `package.json`, `Makefile`, or equivalent;
   - the test runner pointed at the touched paths directly;
   - `npx tsc --noEmit --incremental` plus `npx eslint <changed-files>`.
3. Dispatch a `verifier` subagent ONLY when the agent that made the change cannot produce the receipt itself: its own checks do not cover the declared acceptance criterion, the criterion spans files no single maker touched, or a maker reported a check it could not run. Otherwise read the receipt the maker already returned. Re-running a maker's own passing check is a re-verification round, and it adds a second error source rather than confidence.
4. Where no `/verify-<project>` exists, suggest the `verify-setup` skill as a follow-up. Never let its absence promote the run to the full pipeline.

## Do NOT

- Run `npm run lint && npm run build && npm test` as the default. That is the full pipeline; reserved for pre-push or explicit user request.
- Re-run a check that already passed. A repeated green proves nothing a single green does not.
- Run a check after each individual edit when that check reports every failing row in one run. Run it once, fix every row it named in one pass, then run it once to confirm.
- Claim work is complete without running at least the trivial-change verification.
- Skip verification because "the change is small" — proportional evidence still requires evidence.

## Override

User says "skip verify" or "no need to test" → honor it. Evidence-before-claims is the default, not the only mode.
