---
Status: accepted
Date: 2026-08-11T18:53:34.141Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0341. Logbook's progressive-summary spine is rejected as the rotation summarizer

## Context

The proposal was to reuse the logbook continuity-ledger's progressive-summary spine as the mechanism carrying orchestrator state across the 200K rotation boundary, keeping the full journal as a backup tier for deeper lookups. A code audit of logbook 0.2.4 found that NO summarization algorithm exists anywhere in it: update_thread's spine merge is a flat object spread (src/tools/update-thread.mjs:68-81), nothing ever reads a session log, no spine field is server-derived, and the rubric deciding what survives lives in a skill prompt (skills/debrief/SKILL.md:27-32) applied wholly by the language model. The question "is the summarization logic robust or fragile" therefore has no answer - it is neither, it is simple and unenforced. Four disqualifiers followed. (1) The pointer-retention the backup tier depends on is DOCUMENTED BUT NOT IMPLEMENTED: assertSpineCaps throws CapViolationError with retryable:false (src/model/caps.mjs:22-35,143-145), so caps REJECT and never demote-with-pointer, and no audit trail records what a refresh dropped. (2) Cadence inversion: logbook writes once at session close, whereas rotation writes mid-run at 200K - the moment of maximum context rot, by the most degraded version of the agent. (3) Consumer asymmetry: logbook's own doctrine is that claims are hints to be verified against code and git, which works only because a human reads the briefing and steers; reconcile and rebuild_index see branch/binding and index drift only, never spine content accuracy. (4) Every write is a git commit - 897 for this project - serialised by a worktree lock at src/drivers/git-ref-driver.mjs:33-80, a cost model that assumes a handful of writes per session. Measured compression on this project's own corpus: spine-to-session-log ratios of 27% and 10.5%.

## Options

- Reject logbook's summarizer, adopt its schema discipline - chosen
- Adopt the spine wholesale as the rotation handoff
- Adopt the spine with a human approval gate at every rotation
- Commission a purpose-built model summarizer on the same shape

## Outcome

Logbook's spine is REJECTED as the rotation summarizer. Three of its STRUCTURAL properties are adopted instead, and they are the valuable part: a never-compressed content class stored as append-only numbered sidecars and fetched by pointer, exempt from summarization by CONTENT CLASS rather than by size; a fixed-field schema with hard caps rather than freeform prose, because structure bounds what can be lost; and reject-on-violation rather than silent truncation, because a loud failure the model must fix beats a quiet drop. Logbook is not defective - it is correctly built for an attended, once-per-session, human-read handoff, which is a different job from an unattended mid-run machine-consumed one. The rejection is of the transplant, not of the tool.
