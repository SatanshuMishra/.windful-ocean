---
Status: accepted
Date: 2026-08-19T02:23:08.101Z
Thread-Id: 01M0BV3M8GKVP5HSQKB19Z9WW8
---

# 0611. Retire Lead share as the target: it is a marginal statistic and routing appropriateness is conditional

## Context

User ruling. The goal of the measurement was never the base rate of Lead dispatches. It is whether a Lead is triggered WHEN APPROPRIATE - large tasks with multiple parts that need orchestration - and equally whether Leads are triggered too often. The named over-trigger failure is observed, not hypothetical: architect was dispatched repeatedly on one unit and scope grew without the work ever being implemented through to completion. A share of 10 percent and a share of 80 percent are equally uninformative about either failure.

## Options

- Pick a better numeric bar for Lead share
- Retire share entirely and measure routing appropriateness conditionally
- Keep share as a secondary indicator alongside a conditional measure

## Outcome

Lead share is RETIRED as a target. It is a marginal statistic that sums over all four cells of the routing question - Lead dispatched when needed, Lead dispatched when not needed, no Lead when one was needed, no Lead when none was needed - so any share value is reachable with routing that is entirely wrong. This also explains why the failed bar is uninformative in BOTH directions: 24.23 to 26.60 percent is roughly what a healthy fan-out tree produces when each Lead dispatches several makers, so the failure is evidence about the bar and not about the system. c5's negative outcome is untouched by this and stays struck, per 0610. What replaces it is measured on the delegation TREE the corpus already carries through the sidecar's parent and depth fields, not on a flat row population. The specific replacement measures are proposed and not yet ruled: orchestration yield per Lead dispatch, re-entry concentration per Lead per session, and unorchestrated main-thread work as the under-trigger proxy. Each is chosen for having a defect signature that needs no arbitrary threshold.
