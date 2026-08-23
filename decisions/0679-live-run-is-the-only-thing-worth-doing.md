---
Status: accepted
Date: 2026-08-23T17:39:48.919Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0679. Only work that moves the engine toward a completed live run gets done

## Context

The predecessor thread handed forward four candidate items: the gitleaks runKey false positive, the implement-prompt node_modules artifact, making the test job a required status check, and the absent live GitHub token. This thread adds four more. The user then set one goal above all of them: practically get mitosis running as expected LIVE, and explicitly ruled that any action not contributing to that goal should not be done.

## Options

- Work the handed-forward list in the order it was written, clearing the trunk-greening items first
- Cut every item that does not move the engine toward completing a live run, and order the survivors by how directly they block or endanger that run
- Go straight to triggering another billed run and diagnose whatever it hits

## Outcome

Cut to the live path. c1 is the front, because repository provisioning is the single point the lane has never passed. c4 and c3 follow, because each protects a run that costs real money: an unbounded teardown removal can destroy a directory outside the workspace mid-run, and the built-wait race can kill a run and charge for nothing. c2, making the four unit-less dispatch kinds recordable, is deferred as replay infrastructure that does not itself make a live run succeed. The predecessor's required-status-check item stays out, both because it needs a human in the GitHub UI and because it does not move the engine. Going straight to another billed run is rejected: each one so far bought exactly one defect for about five dollars and seventeen minutes, so paying before the known hazards are closed buys a defect already known.
