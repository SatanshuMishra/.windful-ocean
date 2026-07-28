---
Status: accepted
Date: 2026-07-28T21:17:04.901Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0097. Close this thread as abandoned because the DoD gate cannot be cleared without falsification

## Context

The thread shipped: PRs #10, #11 and #12 are merged and origin/main = a229c9c is fully green at 1544/1544, the first green main in this thread's history. But completion criteria 2 (human runbook Sections 2-5 applied) and 3 (Build A live end-to-end) were made permanently unachievable by user ruling 0095, which descoped the runbook rather than deferring it. The structural DoD gate refuses `done` while any criterion is unchecked, and the criteria are write-once so they can be neither checked nor rewritten. Inspection of the ledger FSM confirmed there is no third terminal state: transition_thread to `done` is DoD-gated and archive_thread writes `abandoned`. So the brief's framing of "close-by-ruling vs abandon" described two outcomes that are not both reachable - the real choice was between an honest label and a falsified one.

## Options

- Abandon with an accurate reason: the FSM writes `abandoned`, the reason field records the shipped outcome and the 0095 cause. Terminal, so create_successor works. The label reads as 'the original DoD will never be met', which is exactly what 0095 decided.
- Override the DoD gate: check criteria 2 and 3 and transition to `done`. Rejected - it records unmet criteria as met, the precise failure the gate exists to prevent, and the thread's own out_of_scope already refuses it.
- Stay paused and open the successor via open_thread with predecessor_id. Rejected - nothing is falsified, but a finished thread would sit in the resumable roster indefinitely, against the finish-before-you-start WIP rule.

## Outcome

Option 1, ruled by the user on 2026-07-28. The thread closes as `abandoned` with a reason that carries the full truth: shipped within the scope that survived 0095, main green, criteria 2 and 3 left UNCHECKED and never rewritten. The status token records the DoD outcome, not a judgment on the work. Read the reason, not the label. Residual defects 0092, 0093 and 0094 transfer to a successor thread rather than dying with this one.
