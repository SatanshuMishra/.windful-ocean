---
Status: accepted
Date: 2026-07-26T21:25:28.092Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0016. Measured: neither guard dominates; the status-quo-is-safer framing is only half right

## Context

The predecessor carried a top risk that the live 0fe1c02 guard is safer than the 5f04dd4 tip and that merging the tip would net-weaken protection, citing 20 commands the old guard denied that the tip allows. A 159-case harness ran every command through both versions with the real protected root. The raw transition count is 42, not 20 - but it splits into two populations the original framing counted as one: roughly half are genuine destructive-intent evasion regressions, and roughly half are read-only commands the tip CORRECTLY stopped over-blocking. The tip additionally adds 6 new correct denies via cwd tracking, backslash unescaping and tilde expansion, and moves ZERO read-only commands from allow to deny. Measured false-positive counts: old about 19, tip 0. The existing suite is 513 pass / 0 fail while more than 20 evasions exist, so the suite covers prefix-word and grouping evasion not at all.

## Options

- Keep the inherited framing that the status quo is safer - rejected: measurement shows the old guard has about 19 read-only false positives and 10 evasions of its own, so it is not dominant
- Flip to the tip being safer and merge it - rejected: the tip allows both named evasions plus roughly 21 more, all traceable to head-only verb matching and to grouping characters not being segment separators
- Record that neither dominates, keep the merge block, and hold the deny-by-default inversion as the only path that beats both - adopted

## Outcome

Neither guard dominates. The merge block on fix/pre-tool-use-guard STANDS, but for a corrected reason: not because the tip is uniformly worse, but because it regresses evasion coverage while improving false positives, and shipping either half alone is a trade rather than a fix. Deny-by-default remains the only path that beats both. Two inherited beliefs are corrected: the 20-command figure conflated evasions with over-block relaxations, and the scanSegments quadratic is not a live hazard - slowest measured classification was 0.29 ms with steady state 0.02-0.11 ms and zero hangs, so the size cap is a bound on deliberate abuse rather than an urgent fix. Ten holes predate BOTH versions and are new scope for the allowlist design: sh/bash/zsh -c string indirection, find -delete and -exec, git -C targeting the root, and xargs from stdin.
