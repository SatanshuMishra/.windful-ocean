---
name: verification-discipline
description: Auto-loads on completion-language phrases ("done", "ready", "verify", "before commit", "ship", "complete"). Enforces evidence-before-claims discipline scaled to change size. For projects with /verify-<project> commands, uses the scoped command; for others, the lightest sufficient checks. Never runs the full pipeline as a default.
---

# Verification Discipline

Evidence before claims, sized to the change.

## Rule

- Trivial change → typecheck + scoped lint on touched files (1–2s).
- Domain-bounded change → invoke `verification-strategist` subagent → run `/verify-<project> <scope>`.
- Cross-cutting change → invoke `verification-strategist` → likely returns `scope=full` → run full pipeline.
- Pre-push (explicit) → run full pipeline.

## Implementation

When invoked:

1. Check if the project has a `/verify-<name>` command (look for `<project>/.claude/commands/verify-*.md`).
2. If yes:
   - Spawn `verification-strategist` subagent (Sonnet) with the touched-files list (from session memory or `git diff --name-only`).
   - Strategist returns `{"scope": "<value>"}`.
   - Run `/verify-<project> <scope>`.
3. If no:
   - Run `npx tsc --noEmit --incremental` and `npx eslint <changed-files>` directly.
   - Suggest running the `verify-setup` skill once so future verification can be scoped via `/verify-<project>`.

## Do NOT

- Run `npm run lint && npm run build && npm test` as the default. That is the full pipeline; reserved for pre-push or explicit user request.
- Claim work is complete without running at least the trivial-change verification.
- Skip verification because "the change is small" — proportional evidence still requires evidence.

## Override

User says "skip verify" or "no need to test" → honor it. Evidence-before-claims is the default, not the only mode.
