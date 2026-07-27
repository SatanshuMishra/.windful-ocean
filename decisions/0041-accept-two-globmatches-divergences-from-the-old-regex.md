---
Status: accepted
Date: 2026-07-27T21:45:45.812Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0041. Accept the linear matcher's two deliberate divergences from the old regex

## Context

The implementer self-reported two places where globMatches does not reproduce globToRegExp exactly, despite the spec saying scopeCovers behavior must not change at all. Recording these so a future session does not read them as bugs and "fix" them back.

## Options

- Force byte-exact parity with the old regex, including its newline behavior
- Accept both divergences and record the reasoning
- Drop the added path-type guard to minimize the diff

## Outcome

Accept both. (1) NEWLINE SEMANTICS: old `**` compiled to `.*`, and JS `.` excludes line terminators without the s flag, so `globMatches('docs/**', 'docs/a\nb')` is now true where the regex gave false. That exclusion was an ACCIDENT of regex compilation, not an intended glob semantic -- the spec defines `**` as "any characters including /". It is unreachable in practice because git quotes paths containing newlines. Directionally it makes the SENSITIVE_SCOPE_GLOBS gate at run-engine.mjs:109 STRICTER (a newline-bearing path now matches `**/*.sql` and is correctly flagged sensitive, where the old code would have let it slip past); it makes the undeclared-path fence at run-engine.mjs:466 marginally less conservative. Net security direction is favorable and the input is unreachable. (2) ADDED FOURTH GUARD: globMatches throws `path must be a string, got ${typeof path}` on a non-string path. This aligns with coding-style.md's "validate at system boundaries" and breaks no caller, because globMatches is a NEW exported symbol -- globToRegExp is deleted, and its only importers were run-engine.mjs itself, mitosis.js's private twin, and the test. ORCHESTRATOR VERIFICATION, not taken on the implementer's word: independently re-ran the suite (1146/1146 pass, exit 0), confirmed all four original scopeCovers assertions intact and unweakened, confirmed the ReDoS regression test passes, and confirmed via the REAL p/default ruleset with --disable-nosem that the globToRegExp findings are gone at source. NOTE the implementer's own report was WRONG in a harmless direction: it predicted 2 residual benign SENSITIVE_SCOPE_KEYWORD_RE findings, but the real ruleset does not flag those at all -- that was the local replica rule being broader than the real one.
