---
Status: accepted
Date: 2026-07-27T21:25:15.584Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0038. Pragma re-adjudication: 2 of 21 REFUTED for a measured, reachable ReDoS

## Context

0033's load-bearing step. Two independent read-only security reviewers re-derived all 21 nosemgrep justifications from code; the orchestrator then cross-checked the contested claims by measurement rather than accepting either agent's report. The two agents CONTRADICTED each other on the same construction: agent 1 called the 8-wildcard glob-to-regex a ReDoS, agent 2 upheld the twin in live-inject.mjs/live.mjs claiming the caps "bound backtracking".

## Options

- Accept agent 1's report as-is
- Accept agent 2's report as-is
- Cross-check the contested claim by direct measurement against the actual exported function

## Outcome

Measurement settled it. Running the ACTUAL exported globToRegExp: glob `x*a*a*a*a*a*a*a*a` (17 chars, exactly 8 wildcards, passes both caps) compiles to 8 chained [^/]* quantifiers; non-matching subjects cost 0.8ms at len 18, 16.3ms at 30, 48.0ms at 34, 78.4ms at 36 -- ~1.7x per 2 chars, superlinear. Agent 2's grounding fact is FALSE: the caps bound the pattern, never the subject. FINAL TALLY of 21: 14 UPHELD; 3 NARROW (ledger-lint.mjs:77 and :79 -- escapeIdentifier at :13 escapes only $, and the exported flagHasReachableTruePath at :74 guards only typeof; live-accept.mjs:357); 2 REFUTED (run-engine.mjs:22 and its byte-identical twin mitosis.js:713 -- the escaping claim is true but irrelevant, the rule also covers DoS and the justification never addresses it); 2 CONTESTED-PREMISE (live-inject.mjs:233, live.mjs:216 -- same construction and blowup, but their globs come from a local user-authored config file, so the conclusion survives on reachability while the stated reason is wrong). Severity is bounded: exploitation needs the subject to align with the pattern's literal skeleton, so it requires a poisoned plan supplying the fileScope glob, not merely a hostile path. SEPARATELY, a semgrep sweep with a local replica rule found 3 UNADJUDICATED dynamic-RegExp sites carrying no pragma at all -- run-engine.mjs:98, mitosis.js:789, design-parser.mjs:166 -- all benign (derived from module-level literal arrays, fully escaped). The 21-item inventory was built by grepping nosemgrep, so BY CONSTRUCTION it enumerates only already-suppressed sites and can never surface these. They are currently invisible only because the sast is diff-aware and they are pre-existing; item 4's "green under ANY baseline" is exactly the condition that would expose them. CAVEAT: the replica rule is a deliberate approximation and may be broader than the real p/default; confirming needs the real ruleset.
