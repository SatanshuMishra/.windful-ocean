---
Status: accepted
Date: 2026-07-31T06:36:37.468Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0146. Adopt spec 7.4: remove all three detect-non-literal-regexp findings, not only :455

## Context

mitosis-gate.mjs carried three blocking semgrep detect-non-literal-regexp findings, pre-existing on main, at :262 (countIdentifierTokens), :275 (collectKeyOccurrences) and :455 (resolveCallSitePhases). B-6 had to touch :455 by construction. Semgrep baselines match by FINGERPRINT, and whether that matching is line-shift-tolerant could not be verified offline — the local scan returns "requires login" for every extra.fingerprint. The section-6 edits were measured to shift :262 and :275 to :265 and :278, so declining to touch them left an unverifiable question about whether the first PR-event run would resurface them as new. This was one of the two decisions the resume brief required be made before dispatch.

## Options

- Touch only :455, the line the refactor must move, and accept the shifted-line risk on :262 and :275 — with spec 7.4's fallback rule of applying the block as an extra refactor commit if the first PR-event sast run reports them
- Adopt spec 7.4's recommendation and de-regex all three by construction in the same refactor commit
- Silence the findings with nosemgrep pragmas

## Outcome

Adopted spec 7.4 in full: all three de-regexed in commit 40c6188, using indexOf scans over the masked source. Resolved by the Three Pillars — Quality over Speed: it converts an unverifiable risk into a verified-clean state. Verified independently by the orchestrator, not taken from the subagent: semgrep --config p/default --error --metrics=off on mitosis-gate.mjs exits 0 with 0 findings, and grep -c nosemgrep returns 0. The nosemgrep option was rejected outright — the constructed RegExps can simply be deleted, and a pragma would silence a rule rather than remove the construction. The gate suite reported 45/45 identically on both sides of the refactor, and the equivalence was reviewed at the diff: findIdentifierTokens' right-edge test reproduces the old (?![\\w$]) including at end-of-string, and findCallSites correctly relies on the '(' requirement as its right boundary exactly as the old pattern did. One new RegExp survives at the file's PHASE_TOKEN_TEXT site; it is built from a module constant, was never among the three findings, and the exit-0 scan confirms semgrep does not flag it.
