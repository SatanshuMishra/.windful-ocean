---
Status: accepted
Date: 2026-08-06T19:27:48.972Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0266. Preserve the threat model's backticks when lifting G1-G5 into the registry, accepting divergence from how B and M were lifted

## Context

0251 promised the G statements would lift verbatim into registry.json's {id, statement, source} shape, and threat-model section 4 says each was written as a single sentence for exactly that. Those sentences carry inline backticks around command and tool strings - `gh pr merge`, `pr-create`, `ask`. The registry's existing B and M entries had their source plan's inline backticks stripped when they were lifted, so preserving the G ones makes registry.json visibly inconsistent with itself.

## Options

- Preserve them, keeping the lift verbatim as promised and keeping command strings distinguishable from the prose around them
- Strip them for visual consistency with B and M, at the cost of editing sentences written specifically to be lifted unedited
- Restore the backticks in the eleven B and M entries too, making all seventeen consistent - a rewrite of existing entries nobody asked for

## Outcome

Preserved. Fidelity to the verbatim-lift promise beats cosmetic consistency in a data file, and the backticks carry information: they mark where a command string ends in statements that name things like `gh pr merge` beside ordinary prose. Recorded so a later consistency pass does not silently strip them and break the verbatim property that 0251 built the sentences for. If consistency is ever wanted, the correct direction is to restore the B and M entries' backticks, not to strip the G ones.
