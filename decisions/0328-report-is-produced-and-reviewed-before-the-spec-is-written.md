---
Status: accepted
Date: 2026-08-11T05:36:37.858Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0328. The architecture report is produced and reviewed before the superseding SPEC is written

## Context

The default brainstorming flow runs design to spec to plan, with no reviewable artifact between the research and the SPEC. This re-architecture carries three harness blockers, a corrected reading of the variance requirement (0326), a substrate change that deletes a whole Part of SPEC B (0325), and ten identified gaps - too much for the user to review for the first time inside a SPEC. The user directed that the report be made FIRST and reviewed before any SPEC is written.

## Options

- Report first, reviewed, then the SPEC - chosen
- Write the SPEC directly from the research findings
- Author report and SPEC in parallel

## Outcome

A cited report is the next deliverable after the two open research passes, produced via the report skill (/report), which orchestrates researcher for verification, report-writer for content, and visual-explainer for rendering. It carries the corrected architecture, the tree and sequence diagrams covering orchestration through fan-out and handoffs, the ten architecture gaps, and the JS-versus-Python and spec-trust findings. The user reviews it. Only after that review is the superseding SPEC authored, so c3 is gated on the report having been reviewed rather than on the research alone. The diagrams belong in the report, not in a separate artifact.
