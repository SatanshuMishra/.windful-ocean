---
Status: accepted
Date: 2026-07-26T21:13:22.298Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0013. Close ledger-v2-archive-and-seed; carry the guard work into a successor thread

## Context

All five completion criteria on ledger-v2-archive-and-seed were verified done in the stored thread JSON. The remaining pre-tool-use guard hardening (invert to deny-by-default per decision 0011) was never among those criteria - it surfaced mid-thread as a blocking risk on a separate repo, continuity-ledger-plugin. Leaving the predecessor open purely to host unrelated follow-on work would violate the finish-before-you-start discipline and keep a satisfied DoD gate artificially unmet.

## Options

- Keep ledger-v2-archive-and-seed open until the guard work lands - rejected: its criteria are all met, and the guard work has a different repo, a different risk profile, and its own DoD
- Close the predecessor and drop the guard work - rejected: fix/pre-tool-use-guard is a blocked branch that would net-weaken store protection if anyone merged it unaware
- Close the predecessor with a closure statement and open a successor carrying the guard mandate plus the load-bearing risks - adopted

## Outcome

Transitioned ledger-v2-archive-and-seed to done with a closure statement naming the successor. Opened pre-tool-use-guard-deny-by-default-inversion (01KYG4AEKA6NM746BXVRAZ9DWE) as its successor, active, with five immutable criteria covering the inversion itself, two-way test proof, the fail-closed size hazard, review, and the merge/publish/re-install tail. Carried forward the status-quo-is-safer warning, the architectural root cause, the CLAUDE_PLUGIN_DATA refutation, and the store-is-a-git-ref navigation note. Added one new risk the predecessor did not carry: the branch tip is 5f04dd4, one commit past the b0e1079 that decisions 0008 and 0011 actually evaluated, so both findings need re-verification against the real tip before they are trusted.
