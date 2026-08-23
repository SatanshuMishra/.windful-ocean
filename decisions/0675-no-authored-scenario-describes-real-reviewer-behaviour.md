---
Status: accepted
Date: 2026-08-23T04:50:51.918Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0675. No authored scenario describes what the real reviewer did

## Context

The one billed run produced eight dispatches: one plan, three plan reviews, two replans, one implement, one review. The live reviewer rejected the plan twice and approved on the third attempt, which is the last allowed revision, since the revision budget is three and exhaustion requires four rejections. The authored scenario set covers three shapes: approval first time, one rejection then approval, and rejection through to budget exhaustion. The recording was probed against all three rather than assumed into one. It fails the one-rejection scenario, whose check requires exactly two plan reviews, and fails the budget-exhaustion scenario, whose check requires four. It passes the approved-first-time scenario, which asserts only the terminal state, while contradicting that scenario's name. Separately, the hand-authored findings payload shape was confirmed correct: every finding the real reviewer returned matched the assumed axis, severity and detail shape exactly, with no extra or missing keys.

## Options

- Place the recording in the approved-first-time scenario's slot, since its assertions genuinely pass, and report the name mismatch and the coverage hole as findings.
- Add a new scenario describing approval on the last allowed revision, and bind the recording to that.
- Relax the one-rejection or budget-exhaustion scenario's dispatch-count check so the recording fits one of them.

## Outcome

Place the recording in the approved-first-time slot and report the mismatch. The acceptance criterion requires the sweep to run against recorded cassettes and any authored-versus-recorded outcome difference to be reported as a finding; it does not require a scenario whose name fits. Adding a new scenario is real work above the ceiling and is filed as a new item rather than folded in. Relaxing an existing check is rejected outright: the check is what made the mismatch observable, and weakening it to manufacture a fit would destroy the only measurement the run bought. The finding itself is the return on the run. The authored set assumes a reviewer either approves immediately, rejects once, or rejects to exhaustion, and real behaviour fell between those shapes, so the set has a coverage hole exactly where reality landed. The narrow observable difference is that the approved scenario's plan-review consumption count moves from one to three while the terminal state and verdict are unchanged, meaning the engine reached the same end by a longer road than any authored cassette imagined.
