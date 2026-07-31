---
Status: accepted
Date: 2026-07-31T20:27:34.693Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0162. Four of six Gap 1 items are extract-to-delete; P3-P5 reshaped, not dispatched as planned

## Context

Decision 0156 landed the mirror gaps as five PRs and 0157 ruled that Gap 1 extracts only what a named milestone is about to touch. Plan section 11 flagged the strongest objection to its own recommendation - that P3, P4 and P5 are speculative work justified by milestones that may not land as scoped - and prescribed the mitigation: before opening each, re-confirm the justifying milestone still names the region. That gate ran as a read-only workflow pinned to 7b8acd2, auditing every admitted Gap 1 item against the quiescent-advance spec's own text. The user was presented with four dispositions and chose the reshape.

## Options

- Dispatch P3-P5 as planned, honoring section 5.1 criterion 1 as literally written, which admits a region a milestone 'modifies, absorbs OR DELETES'
- Reshape per the gate: extract only the confirmed item, characterization tests for the large deletion targets, drop the refuted ones
- Extract only the one confirmed item and defer everything else to each milestone's own planning
- Stop the pre-M3 sequence after P2 and revisit the whole Gap 1 programme later

## Outcome

RESHAPE. The audit result, measured against pinned spec text: of six remaining admitted items only A7 survives with a confirmed justification - M7 names runDivergenceProbes explicitly and collapses three mechanisms into one predicate. A3 is a delete target per 0161. A4's driver M4 deletes clampWindow BY NAME along with the AIMD controller. A5's driver M5 deletes the bounded poll BY NAME. A6's claimed driver is refuted outright: the phrase report-assembly appears NOWHERE in the spec, and the actual end-of-run mechanism is tied to section 6, which the landing table assigns to M1 - already landed at 1bb149d. A2's M7 basis is refuted (no spec text names forge-PR classification in M7's scope) and its M2 basis is unconfirmed pending a section 3.1 check. So four of six items are extract-to-delete and one has no textual basis at all. Section 5.1 criterion 1 and section 11 are in genuine tension here - criterion 1 admits deletion targets, section 11 calls extracting code in order to delete it motion rather than quality - and section 11 wins as the later adversarial ruling. Ratified shape: A7 extracts for real; A3 and A5 get characterization tests and NO extraction, because both are large and complex (144 lines, and mergePoll mutates four shared closure variables) so pinning them makes the coming deletions verifiable at the unit layer; A4 is dropped as too small to be worth pinning at 3 lines; A6 is dropped on a refuted basis; A2 is HELD pending the section 3.1 check of its M2 claim. Two plan claims were CONFIRMED rather than refuted and stay: A3 really does call assembleReport, so the A6-before-A3 ordering was real, and A2+A7 really do share a downstream consumer, so their grouping held. Method note carried forward: the gate ran against pinned git-show extracts rather than the working tree specifically because another workflow was mutating branches concurrently, and every line number reported is a pinned line number.
