---
Status: accepted
Date: 2026-07-26T21:22:09.232Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0015. Govern the guard fix by the sibling guard's principle: over-catch to ask, never under-catch

## Context

A dual-review findings doc in the frozen v1 archive (analysis/2026-07-21-msp2a-hook-security-findings.md, thread mitosis-git-actions-robustness) records the identical failure mode on a sibling guard, .claude/hooks/block-destructive-bash.sh: a tokenizer rewrite silently ALLOWED destructive operations the previous adjacency-regex had caught, because the regex fallback ran only when the tokenizer RAISED, never when it parsed cleanly but missed. Two independent reviewers converged. The adopted fix was an additive union - run the old check whenever the new one produced no reason - empirically verified to recover every missed catch with ZERO false positives against that guard's 12 allow-commands. The doc states the principle as "Fail-safe (over-catch -> ask), never under-catch", and that guard uses ask rather than deny as its safe verdict. It also documents two evasion classes our brief omitted: no basename resolution on the command head, and $'...' ANSI-C quoting defeating both the regex and the tokenizer.

## Options

- Ignore the sibling guard as unrelated - rejected: same repo family, same failure mode, same reviewer pair, and the findings were peer-verified empirically rather than argued
- Import the additive-union fix wholesale - rejected: that guard's regex was measured false-positive-free, whereas ours demonstrably over-blocks because its MUTATING pattern trips on any bare redirect, so the union would breach the reads-must-keep-working constraint
- Adopt the PRINCIPLE now and let the mechanism be settled on our own measured evidence - adopted

## Outcome

Over-catch to ask, never under-catch, is the governing principle for this fix. Concretely: ask is an acceptable third verdict for the genuinely-ambiguous set and is preferred over either silently allowing or hard-denying it, following house precedent. The additive-union mechanism is a strong candidate but is NOT adopted on the sibling's evidence - it must be measured against our own read-only corpus first, because our old rule over-blocks on bare redirects; if the union's only false positives are redirect-driven, a redirect-stripped variant of the old predicate is the fallback shape. Basename resolution of the command head and $'...' handling are added to the required coverage: deny-by-default fixes basename evasion on the deny side but inverts it onto the read-only allowlist, which must basename-resolve; $'...' is unhandled by our frozen tokenizer and must be treated as a suspicious token rather than trusted.
