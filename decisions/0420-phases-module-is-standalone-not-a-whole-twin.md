---
Status: accepted
Date: 2026-08-14T09:01:19.742Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0420. phases.mjs is STANDALONE in the mirror census, not a WHOLE twin

## Context

C1 extracts the phase model into its own lib module. The mirror census forces a choice per module: a WHOLE twin must appear verbatim inside .claude/workflows/mitosis.js, while STANDALONE carries no twin obligation. mitosis.js declares its phase list in an exported meta literal that the workflow host parses.

## Options

- WHOLE twin mirrored into mitosis.js verbatim - rejected: forces either triple duplication of the phase table or an identifier-valued meta.phases
- STANDALONE with no twin obligation - chosen
- Inline the phase table at each call site - rejected: reintroduces the drift the single authority exists to remove

## Outcome

phases.mjs is declared STANDALONE. A WHOLE twin would have forced either triple duplication of the phase table or an identifier-valued meta.phases, and the latter risks the workflow host's parse of the exported meta literal - a correctness risk no local test can catch, since the parse happens in the host rather than in the suite. The same reasoning already applies to pool.mjs, which is STANDALONE for its own reasons.
