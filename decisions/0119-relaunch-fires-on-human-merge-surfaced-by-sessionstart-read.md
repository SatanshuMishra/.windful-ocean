---
Status: accepted
Date: 2026-07-30T06:11:23.496Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0119. The relaunch trigger is the human merge action surfaced by a SessionStart run-status read; resume state travels in args, not through a bootstrap dispatch

## Context

0111 left the last design gap in 0108 open: what fires the relaunch under end-and-relaunch, given there is no suspend or signal primitive in the sandbox (0107) and a webhook needs a server excluded by the no-direct-cloud-access rule. Recorded default preference was the human's own merge action plus an optional scheduled nudge. 0108 specific 2 left a coupled input undesigned: the orchestrator cannot read its own journal, so resumption is either a launcher passing state via args or exactly one bootstrap agent() call. The user directed on 2026-07-30: proceed with the recommended robust plus simple option for both open questions. Verified this session: the reconcile-only advance path already exists (mitosis.js:2905 runReconcileOnlyAdvance, phase Shepherd at :2906) and already reads merged state and advances the frontier, so relaunch has an existing home in code.

## Options

- Human merge action as the only trigger, human types the resume command
- Human merge action surfaced by an engine-external SessionStart run-status read, optional scheduled nudge off by default
- Scheduled check as the primary trigger
- Webhook

## Outcome

HUMAN MERGE ACTION IS THE TRIGGER, surfaced by an engine-external SessionStart read. Approved. TWO MOVING PARTS, both piggybacking on 0113's already-approved unconditional SessionStart hook line: (1) a run-status verb that scans the journal for parked runs and, per parked run, does ONE gh pr view --json state,mergedAt read; (2) the conversation surfaces resumable runs. This is NOT polling under 0111: it costs zero model tokens, holds no run alive, and fires once per session start rather than per cycle. Optional scheduled nudge stays OFF BY DEFAULT, implemented as the same run-status verb under a scheduled task, never as a live run. Webhook stays excluded (needs a server). RESUME INPUT, closing 0108 specific 2: the LAUNCHER passes a bounded resume envelope via args - the launcher is an ordinary agent with file reads, so it reads the journal itself and pays ZERO bootstrap dispatches. Envelope contents: run id, spec pointer and content hash, per-MSP status and PR number, frontier states, gate manifest hash, prompt-text hashes for the replayable prefix. HARD CAP on the envelope declared explicitly; exceeding it falls back to a pointer plus exactly ONE bootstrap agent() call, which 0108 already permits. ROBUSTNESS PROPERTIES, the reason this is the simple option and also the robust one: no new failure domain, no server, no daemon; a MISSED trigger costs LATENCY ONLY and never correctness, because the content-keyed journal is the source of truth; relaunching an already-advanced run replays the journal prefix and no-ops, so the trigger is idempotent and double-firing is harmless; review state is read ONCE at relaunch, which deletes 0105's APPROVED double-count by construction rather than fixing it. MAPPING TO EXISTING CODE: the relaunch entry point IS the reconcile-only advance, so no new phase is invented - see the phase-parity decision recorded alongside this one, which declares it under the honest name Resume. NAMED RESIDUAL HOLE, not to be softened: a parked run resumes only at the next session start or optional nudge, so merge-to-resume latency is human-paced. Accepted because 0104 and 0111 already place human merge latency out of scope. FALSIFIER: a harness capability that resumes a specific workflow run across sessions from an external event would make orchestrator-level parking expressible and reopen this.
