---
Status: accepted
Date: 2026-08-02T07:32:33.820Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0205. The invalidatingParents counter is asserted in the four real-invalidation tests, narrowing section 11's no-test refusal to log-string assertions only

## Context

Audit F2 discovered a fifth finding the original four-lens ship gate missed, and proved it by mutation: replacing the increment at reconcile.mjs:115 with `if (false)` leaves reconcile.test.mjs at 23/23 GREEN. The two tests fc035fc touched (:202-203, :221) assert invalidatingParents === 0 only in the NO-INVALIDATION cases; none of the four tests exercising a real invalidation (:133-139, :142-155, :157-162, :164-183) assert the counter at all. So the counting logic 0200 designed ships with zero acceptance coverage. This collides with the REMAINING-PHASES BRIEF, which ordered 'NO TEST -- section 11 refuses one and a log-string assertion is a change detector. Do not let an agent add one.' That refusal was aimed at asserting the emitted LOG STRING. The counter is a returned integer on planReconcile's return shape, per 0200, and is assertable without touching the log line.

## Options

- Keep the no-test ruling as written and ship the counter unasserted
- Assert invalidatingParents in the four tests that exercise a real invalidation
- Defer to a named follow-up and disclose the gap candidly in the coverage row

## Outcome

ASSERT THE COUNTER -- user ruling 2026-08-02. Add invalidatingParents assertions to reconcile.test.mjs:133-139, :142-155, :157-162 and :164-183, the four cases that exercise a real invalidation. SECTION 11's NO-TEST REFUSAL IS NARROWED, NOT OVERTURNED: it continues to forbid asserting the emitted log string, which would be a change detector coupling a test to prose. It does not reach a returned integer on planReconcile's return shape, which is a public contract 0200 deliberately added and which the F2 mutation proves is currently unpinned. The distinction is the point -- the earlier refusal did not contemplate this surface because the counter did not exist when it was written. These assertions land on feat/m4-divergence-instrumentation as their own commit after the rebase, alongside but separate from that branch's coverage file. The mutation F2 ran (`if (false)` at reconcile.mjs:115) is the acceptance receipt: it must be red after this change and is currently green.
