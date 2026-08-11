---
Status: accepted
Date: 2026-08-11T05:56:02.633Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0329. The rotation trigger is an absolute token count, calibrated before it is fixed

## Context

The user directed that the rotation trigger be scaled to WINDOW SIZE, so a 250K window and a 1M window would get different thresholds. The research pass contradicts that premise. RULER (arXiv:2404.06654) found models claiming 32K to 1M cluster at 4K-64K ABSOLUTE effective context, not at a common fraction. NoLiMa (arXiv:2502.05167) found 11 of 13 models drop below half their own short-context baseline at a fixed 32K regardless of claimed window. Anthropic's shipped compaction triggers on absolute input tokens - default 150,000, floor 50,000 - and does not scale with the 1M beta window. A fractional trigger would therefore rotate a 1M orchestrator far too late. No published study measures an agentic build orchestrator at any window size, so every figure available is measured on a different task shape.

## Options

- Absolute token floor, calibrated before the number is fixed - chosen
- Absolute floor plus an independent turn/compaction-event axis
- Keep the window-scaled fraction as originally directed
- Ship no threshold at all; defer the number to a later change

## Outcome

The trigger is an absolute input-token count with NO window scaling. The user's window-scaling direction is withdrawn on the evidence. 100K is the provisional starting default, chosen because it sits between Anthropic's own shipped trigger and NoLiMa's measured onset, and the SPEC must state plainly that it is unvalidated for this orchestrator rather than presenting it as measured. The canary calibration recipe gates the final number: log ResultMessage.usage against injected canaries (verbatim constraint restatement, early-decision recall, one deliberately ambiguous boundary), sample every 20-30K tokens across 3-5 real sessions, and plot against both the absolute-token and the event-count axis so the absolute-dominates prediction is falsified locally rather than imported. Verbatim constraint pinning is adopted regardless of the trigger chosen - arXiv:2606.22528 measured it restoring post-compaction constraint violation from 30-59% to 0% at under 0.5% of context. Recalibration is required whenever the model or window changes, since RULER is itself evidence that thresholds do not transfer.
