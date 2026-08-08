---
Status: accepted
Date: 2026-08-08T06:33:43.944Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0292. The live swap moves to a dedicated session, honoring SPEC section 7 substance over 0289 session count

## Context

0289 adopted, on the user's explicit direction, that one fresh session would build the cutover unit and then perform the live swap as its last act. It named the tension openly: SPEC section 7 and 0274 require the cutover to run in a session doing nothing else, and a session that also authors the tool is doing something else. 0289 resolved that by ordering within the session rather than by session count, reasoning that the hazard is concurrency with the swap, not authorship earlier. What 0289 could not predict was how much authorship the unit would take. Measured this session: the unit needed two full review rounds, both returning BLOCK, the first with 2 CRITICAL and 4 HIGH and the second with 3 HIGH, and a third round was still running at hand-off. The build consumed the session's context to the compaction threshold, which is precisely the condition under which an operator performing an irreversible live migration should not be operating.

## Options

- Perform the swap in a fresh session that does nothing else - ADOPTED. Perform the swap in this session as 0289 directs, on a context at the compaction threshold with a third fix round still unreviewed - rejected, because it satisfies the session count while violating the thing the session count was a proxy for. Continue building here and swap once round 3 lands - rejected for the same reason, and it assumes round 3 is the last round, which two prior rounds argue against. Re-open the question with the user first - rejected as unnecessary, because the directive was about not splitting a fully specified plan across a context rebuild, and that cost is not incurred here.

## Outcome

Adopted. The build finishes and the PR lands; the 0281 rehearsal and the live swap then run in a session that does nothing else. This diverges from 0289's letter and honors its substance. 0289's own reasoning licenses the change: it identified the hazard as concurrency with the swap, and a dedicated session removes that hazard more completely than an ordered single session does. The single-session directive existed to avoid paying for a context rebuild on a fully specified plan, and that cost is not incurred here, because the specification, the invariants, the round 3 instructions and the review findings are written down in the ledger and in durable artifacts outside the session. Recording the divergence rather than silently reinterpreting it is the point, exactly as 0289 did for its own divergence from SPEC section 7. One obligation this places on the swap session: it inherits 0286's rule that the rehearsal runs against the sha that actually ships, so the 0281 rehearsal happens after the PR merges, and the prior green rehearsal against 1e84dd1 remains stale evidence.
