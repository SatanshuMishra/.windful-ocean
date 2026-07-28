---
Status: accepted
Date: 2026-07-28T20:57:48.497Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0094. protect-claude-config.sh does not cover git worktrees, so every fanned-out mitosis agent bypasses it

## Context

Probed with the unmodified guard and the real HOME. `.claude/workflows/mitosis.js` in the primary checkout returns ASK; the same file at `.claude/worktrees/<name>/.claude/workflows/mitosis.js` returns NO decision, and so does `.claude/worktrees/<name>/.claude/settings.json`. Every worktree path is unguarded whether it lives outside the repo or inside it - the in-tree case is not saved by prefix matching, because the protected roots are <repo>/.claude/{hooks,rules,lib,workflows} and <repo>/.claude/worktrees/... starts with none of them. This is a realistic deployment, not a corner case: mitosis.js:1077-1078 instructs every fanned-out agent to work in a dedicated `git worktree add`. It was demonstrated live this session - three agents edited .claude/workflows/, .claude/hooks/ and .claude/lib/ inside a worktree with no confirmation prompt, while the identical edits in the primary checkout would have prompted.

## Options

- Derive worktree checkouts from `git worktree list --porcelain` at the realpath-derived base and add them to bases
- Match any `/.claude/` path component relative to a discovered repo root
- Leave the guard as-is and rely on review

## Outcome

NOT FIXED - deliberately held. The debugger that found it was scoped to a test-hermeticity fix and correctly refused to widen a security control's scope as a side effect. This is a behavior change to a guard and deserves its own MSP. The sibling thread mitosis-nonstop-shipping-architecture already has `fix/guard-any-claude-root` cut at beca874 with no commits, which is the natural home. This finding also weakens 0093's mitigation, since "the poisoning write must pass the guard" does not hold inside a worktree.
