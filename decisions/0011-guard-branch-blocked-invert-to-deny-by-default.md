---
Status: accepted
Date: 2026-07-26T20:52:22.482Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0011. fix/pre-tool-use-guard is BLOCKED from merge; the guard must invert to deny-by-default

## Context

Security review of main..fix/pre-tool-use-guard (b0e1079 + the new 5f04dd4) returned BLOCK. On a 55-command corpus, 20 commands that the OLD 0fe1c02 guard DENIED are ALLOWED by the branch, against only 3 new true positives gained. The orchestrator independently reproduced 12 of 12 headline regressions on its own harness against the real module.

Verified regressions, all old=DENY new=ALLOW: bare & is not a segment separator so `true & rm -rf <root>` swallows the second command; grouping constructs are lexed as ordinary words so `( rm -rf <root> )`, `{ rm -rf <root>; }` and `( cd <root> && rm -rf threads )` all pass - wrapping ANY blocked command in one pair of parens defeats the guard; command prefixes shift words[0] so sudo/env/command/timeout/nohup/time/exec/!/FOO=bar/then/do all pass; $'...' and $"..." mis-lex to a corrupted token; destructive verb not at head passes (find -exec rm, xargs rm, git -C <root> rm); option-attached paths are filtered as flags so dd of=<root>/f and cp --target-directory=<root> pass.

Root cause is architectural, not a list of missing cases. pre-tool-use.mjs decides allow-unless-provably-destructive - deny-by-exception over a hand-rolled bash parser. Every gap in the parse is a silent evasion, and the failure mode is silent destruction of the ledger. The blunt 0fe1c02 substring matcher over-blocked but was correspondingly hard to evade; precision without inverting the default traded evasion-resistance for ergonomics.

Also found: scanSegments is quadratic (128k tokens = 15.2s) against a 10s hook timeout, so the guard fails OPEN under load. No ReDoS. Public-repo hygiene independently re-confirmed clean.

## Options

- Merge the branch now to gain the over-blocking cure and fix the evasions later
- Block the merge and invert the decision rule to deny-by-default within the protected root, keeping the new tokenizer
- Abandon the branch and keep 0fe1c02 permanently
- Patch the enumerated gaps one by one, keeping deny-by-exception

## Outcome

BLOCKED from merge. Nothing was merged, published, or installed; main and the live install both remain 0fe1c02. Chosen direction: invert the decision rule to deny-by-default WITHIN the protected root - if any resolvable token in a segment lands under a root, DENY unless the segment head is on an explicit read-only allowlist (ls, cat, head, tail, wc, grep/rg, diff, stat, du, jq, file, sed -n, git read subcommands, find without -delete/-exec). KEEP the new tokenizer, which is what cured the false denies; change only the rule. This closes all four CRITICALs and both HIGHs at once rather than enumerating gaps forever, and the review's 41-command zero-false-deny corpus is the regression suite that proves the b0e1079 ergonomics win is preserved. Patching gaps individually was rejected as unbounded. IMPORTANT: the status quo is the SAFER state - 0fe1c02 over-blocks but resists evasion, so there is no urgency to ship. Follow-ups not blocking: quadratic scan must fail CLOSED on a size cap, cd - / pushd / subshell cwd desync, git clean -fdx and git checkout -- destroy ledger content without touching the ref, and the bare mcp__ledger__* auto-allow is over-broad for a public plugin.
