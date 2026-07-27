---
Status: accepted
Date: 2026-07-27T23:27:36.661Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0053. Both reviewers' const-propagation HIGH was refuted against the real pinned ruleset; IDENTIFIER stays a plain literal anyway

## Context

The first implementation of the boundary guard introduced `const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;` and derived `const IDENTIFIER = IDENTIFIER_RE.source.slice(1, -1);` to keep one source of truth while avoiding a non-literal `new RegExp` (which would trip detect-non-literal-regexp). code-reviewer raised this as HIGH and security-reviewer as MEDIUM, independently and with the same mechanism: semgrep constant-propagates a `const` string LITERAL through template interpolation but cannot propagate a `.source.slice()` result, so `scanFlagDeclarations`' `new RegExp` at ledger-lint.mjs:62 — byte-identical in both versions and carrying NO pragma — would flip from provably-literal to non-literal, producing a NEW unsuppressed finding and failing the sast job. Both reviewers built probe fixtures and both explicitly caveated that they could not fetch p/default (network denied to subagents) and were therefore testing RECONSTRUCTIONS of the registry rule, not the rule itself. The orchestrator could fetch it (python3 urllib) and had semgrep 1.170.0 locally, identical to the CI pin. Direct test with the real ruleset and --disable-nosem, so nothing could hide: the modified file yields exactly two findings, at lines 79 and 81, the two known pragma sites. Line 62 does NOT fire. The same --disable-nosem scan of the unmodified file yields the same two-site set. Diff-aware CI mode cannot invent a finding that a full scan on head does not produce, so the predicted CI failure could not occur. Separately, security-reviewer's proposed remedy was `const IDENTIFIER_RE = new RegExp(\`^${IDENTIFIER}$\`)`, which would itself introduce a non-literal RegExp at line 11 — the precise construct the constraint existed to avoid.

## Options

- Implement the reviewers' fix as given (`new RegExp(`^${IDENTIFIER}$`)`) — REJECTED: introduces a non-literal RegExp at line 11, worse than the problem it claims to solve
- Keep the .source.slice(1,-1) derivation unchanged, since the CI-failure claim is refuted — REJECTED: the readability critique survives refutation on its own merits, and slice(1,-1) is positional magic coupled to the anchor characters that would silently corrupt the character class feeding scanFlagDeclarations if the anchors ever changed
- Revert IDENTIFIER to its original plain literal and add IDENTIFIER_RE as a SEPARATE literal regex — CHOSEN
- Accept the reviewers' verdict without independent verification — REJECTED: receiving-code-review requires technical verification, not performative agreement; the caveat that the rule was reconstructed was load-bearing and both reviewers flagged it themselves

## Outcome

Shipped as two independent literals: `const IDENTIFIER = '[A-Za-z_$][A-Za-z0-9_$]*';` restored to its original pre-change form, and `const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;` added beside it with NO flags (so `.test()` carries no lastIndex state). This resolves the reviewers' readability objection, removes the disputed construct regardless of who was right about the rule, keeps line 62 const-foldable and therefore robust to FUTURE ruleset drift, and shrinks the diff by no longer refactoring a constant the brief never asked to touch. The duplicated character class is accepted as visible, adjacent duplication. Durable lesson for this repo: a subagent review finding about semgrep behavior is not verifiable by the subagent, because network fetch of the pinned ruleset is denied to them — the orchestrator must re-test such findings against the real p/default before acting, and both the finding AND the proposed fix must be checked.
