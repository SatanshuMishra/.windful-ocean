---
Status: accepted
Date: 2026-08-16T20:58:55.068Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0481. Withdraw the report skill and put the answer-format standard in every agent body

## Context

User ruling: the report skill must not be used in its current state. It was intended as a thin wrapper around the visual-explainer skill and was never properly built or optimised.

The user restated a standing preference that applies to every agent answer, not only to reports: no large paragraphs; small, concise, broken-down, well-organised text; assume no domain understanding; define the terminology; explain what is being done, why it is being done, and why other approaches were not considered. No assumptions.

That preference is an obligation on agent behaviour, and section 3b of the report already established where obligations must live. An instruction delivered on the advisory channel - CLAUDE.md and the rules files - was visible to 15,573 runs and produced zero compliance.

## Options

- Fix the report skill so it wraps visual-explainer properly
- Withdraw the skill and put the output standard in a rules file
- Withdraw the skill and generate the output standard into all 13 agent bodies as a shared fragment

## Outcome

The report skill is withdrawn from the architecture. technical-writer preloads visual-explainer only and writes report content directly; the skill's five references to a report-writer agent stop mattering rather than needing to be repointed.

The answer-format standard becomes a generated body fragment, added to the shared-fragment set in report section 9g alongside the Work Order contract, the Receipt contract, the honesty ladder, no-comments and never-touch-a-live-system. One edit propagates to 13 files and the drift check makes a miss detectable.

Rejected: a rules file, because that is the exact delivery path measured at zero compliance. Rejected: fixing the skill, because the user ruled it out for this cycle and the output standard binds every agent answer regardless of whether a report is being written.
