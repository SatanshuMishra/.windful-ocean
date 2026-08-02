---
Status: accepted
Date: 2026-08-02T22:38:37.613Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0211. A killed workflow is recovered by journal extraction and a hand-authored continuation, not by resumeFromRunId

## Context

Workflow wf_86a9cc67-84d died mid-Verify when the application quit, after 8 of 10 agents had completed: three grounding reports, the plan, the plan audit, the implementation (a real commit on a real branch) and one independent receipts run. The harness suggested relaunching with resumeFromRunId, but resume is same-session only and the application had restarted. A cache miss would have re-run every agent, and the implement agent had been instructed to STOP if its worktree already existed - so a miss would have cascaded into a blocked run that discarded a completed implementation.

## Options

- Relaunch with resumeFromRunId and hope the cache survives the restart - a miss re-runs six agents and then blocks on the existing worktree
- Extract the completed results from journal.jsonl, write them to a scratchpad, and hand-author a continuation workflow covering only the remaining phases
- Restart M7 from scratch and discard the completed implementation

## Outcome

Journal extraction. journal.jsonl carries one result line per completed agent with its full return value; the seven recovered results were written to a scratchpad directory and the continuation workflow's prompts referenced them BY FILE PATH rather than embedding them, which kept the script small and the orchestrator's context intact. The continuation covered only Verify, Remediate and Ship (5 agents) and re-ran nothing. Two things made this work and are the reusable part: the implementation was durable OUTSIDE the workflow (a real branch and worktree on disk, not in-memory state), and the orchestrator re-read the recovered results itself rather than trusting the run's summary - which is how the audit's false BLOCKING finding and the false red verdict were both caught before they could act on the continuation. Check disk state before relaunching any killed workflow: a half-created worktree makes a naive re-run worse than useless.
