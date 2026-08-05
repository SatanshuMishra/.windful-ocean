---
Status: accepted
Date: 2026-08-05T21:01:19.369Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0252. Ratify the bash gate threat model, unblocking gate code from c3 onward

## Context

This thread exists because six consecutive fix rounds each closed one finding and opened another, with the assurance level never written down. Step 2 was defined as writing that down first and stopping for ratification before any gate code. docs/security/bash-gate-threat-model.md was written to that brief, then reviewed: its first reader flagged that section 6 had no inbound pointer to the escalation control that governs adding rows, and that section 9's accepted design costs sat in prose while every comparable statement was tabulated. Separately the orchestrator found that section 6's fail-open row named one path where the live gate has three, which would have sent c3 to fix a third of the problem.

## Options

- Ratify as written, accepting the navigability gaps and the understated fail-open row
- Amend the four specific defects and then ratify, keeping section numbering stable because two other files point into the document
- Send it back for a broader rewrite

## Outcome

Amended, then ratified on 2026-08-05 by the repo owner. Four changes, all additive with section numbers and headings untouched: a governance pointer at section 6 tying new rows to the escalation control and definition-of-done item 4; two-way cross-pointers between sections 6 and 9 that keep them deliberately unmerged because section 6 records live exposures of today's gate while section 9 records forecast costs of a decomposition not yet built; the fail-open row rewritten to name all three paths; and the status line flipped from awaiting ratification to ratified, restating the now-satisfied gate rather than deleting it. The document's definition of done (section 7) and escalation control (section 8) now govern every gate change, and c3 may proceed to code.
