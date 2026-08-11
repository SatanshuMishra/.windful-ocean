---
Status: accepted
Date: 2026-08-11T07:00:42.370Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0334. The rotation threshold is 200K absolute tokens, and the counting field is the open question

## Context

0329 set a PROVISIONAL 100K absolute trigger, reasoning from RULER (arXiv:2404.06654) and NoLiMa (arXiv:2502.05167) plus Anthropic's shipped 150,000-token compaction default. The user has now directed 200K on a 1M-context model, so that pending in-flight work can complete inside a 200K-300K band before the session is ended. A verification pass changed the evidence picture underneath both numbers: RULER stops at 128K and NoLiMa anchors its headline at 32K, so NEITHER measures the 100K-300K band, and the prior 100K was extrapolation from a degradation trend rather than a measurement at 100K. No published figure exists for tokens consumed between trigger-fire and handoff-complete, so the 200K-to-300K margin is reasoned engineering headroom, not a measured bound. Two counting defects surfaced that outrank the threshold value itself: Anthropic defines input_tokens as excluding cache reads, with true occupancy being input_tokens plus cache_creation_input_tokens plus cache_read_input_tokens, and an orchestrator's large stable prefix lands mostly in cache_read; and summing input_tokens across turns double-counts, because each turn's input already carries the whole prior conversation.

## Options

- 200K absolute, counted as latest-turn three-field total occupancy - proposed, pending user answer
- 200K absolute, counted as literal input_tokens as directed
- Keep 0329's provisional 100K
- Defer the number to the local canary calibration run

## Outcome

The threshold is 200,000 absolute tokens, superseding 0329's provisional 100K. 0329's REASONING survives untouched - the trigger stays an absolute count with no window scaling, and local canary calibration still gates the final number - so this supersedes 0329's value, not its form. The SPEC must state plainly that no benchmark measures the 100K-300K band and that the 200K-300K completion margin is reasoned rather than measured. The counting field is recorded as OPEN and must be settled before the supervisor is built: reading usage.input_tokens alone undercounts occupancy by whatever sits in cache_read, which for an orchestrator is most of it, and a trigger that undercounts fires late or never. Cumulative summing across turns is rejected outright as a measure of context fill regardless of which fields are summed - the trigger reads the latest turn. Correction carried into the artifact: the diagram page misstates constraint pinning as 30-59% of runs; arXiv:2606.22528 measured 0-59% across seven models with a pooled average of 30%, restored to 0% at roughly 47 tokens and under 0.5% overhead.
