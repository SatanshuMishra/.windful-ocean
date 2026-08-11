---
Status: accepted
Date: 2026-08-11T16:28:28.900Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0336. Rotation fires at 200,000 tokens of true context occupancy, not input_tokens alone

## Context

0329 set a provisional 100K absolute trigger and left the counting field unstated. The user directed 200K instead, reasoning that a 1M-context model should leave room for pending work to finish inside a 200K-300K band before the session ends. A research pass found the evidence base thinner than 0329 implied: RULER (arXiv:2404.06654) stops at 128K and NoLiMa (arXiv:2502.05167) anchors at 32K, so NEITHER measures the 100K-300K band - the original 100K was extrapolation from a trend, not a measurement, and 200K is no less grounded. Two defects surfaced that matter more than the number. Anthropic defines total context as input_tokens + cache_creation_input_tokens + cache_read_input_tokens (platform.claude.com/docs/en/api/messages), so an orchestrator with a large stable prefix banks most of its occupancy in cache_read and a supervisor reading input_tokens alone undercounts, firing late or never. And each turn's input_tokens already contains the whole prior conversation, so summing across turns measures cost, not fill.

## Options

- 200K measured as latest-turn three-field total - chosen
- 200K measured as literal input_tokens, as the field is named
- Keep 0329's provisional 100K
- Defer the number to the calibration run

## Outcome

The trigger is 200,000 tokens, measured as the LATEST TURN's input_tokens + cache_creation_input_tokens + cache_read_input_tokens - true context occupancy, never a running sum across turns and never input_tokens alone. This supersedes 0329's provisional 100K; 0329's ABSOLUTE-not-fractional finding and its canary calibration recipe survive untouched. The 200K-300K completion band is a reasoned engineering margin and must be labelled as such: no published figure exists for tokens consumed between trigger-fire and handoff-complete. One carried correction for the artifact - the diagram page states constraint-pinning restored violations from "30-59%", but arXiv:2606.22528 measured 0-59% across seven models with a pooled average of 30%, restored to 0% at roughly 47 tokens.
