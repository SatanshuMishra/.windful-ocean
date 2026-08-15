---
Status: accepted
Date: 2026-08-15T17:11:02.047Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0438. Receipts gates@1.1 becomes the sole verification standard and every home-grown mandate is retired

## Context

Fifteen of twenty-two MSPs shipped in three weeks, and the rate collapsed rather than improved. Diagnosis found the cause in decision 0380, which declared SPEC acceptance lists a FLOOR rather than a ceiling. A floor with no ceiling is an unsatisfiable acceptance criterion, so work against it cannot terminate as a matter of logic, not discipline: any reviewer can name something above the floor and that becomes the new floor. Eleven method mandates then accreted, each promoted by an agent from a single incident to universal scope with no user sign-off, and each adding unverified apparatus that the next round had to verify. C6 is the proof: the SPEC named boundary-gate.mjs plus tests, boundary-gate.mjs is 206 lines, and the MSP shipped 24 files and 6489 lines, including a boundary-census-control-probe.mjs. Measured against the receipts plugin, every one of the eleven is a hand-rolled unbounded reimplementation of a gate that already exists bounded and machine-run: the hand-written mutation rows are G14 capped at twelve mutants, acceptance-is-a-floor is G0 inverted, closed censuses are G6 residual-zero, MIRROR_CENSUS is G15, re-review rounds are G9, and the rebase anchor rule is G8. The enforcer has been wired in this repo the whole time and never asked for a receipt, because claim.require_receipt_for defaults to fix-claims only and every MSP PR is a feature PR with no issue link.

## Options

- Keep the home-grown mandates and add a twelfth governing their growth
- Cap the apparatus by ratio or per-MSP budget
- Escalate to the user whenever a round threatens to repeat
- Retire every home-grown mandate and adopt receipts/gates@1.1 as the sole external closed standard - chosen

## Outcome

receipts/gates@1.1 is the sole verification standard across every project, recorded globally at .claude/rules/common/receipts.md with a CLAUDE.md invariant pointer, commit 4f5e88f7. Three properties make it terminate where the home-grown set could not. The gate set is EXTERNAL, versioned and CLOSED: an agent may propose a gap and may never promote a finding into a project-local mandate, which structurally forecloses the 0380 mechanism. Acceptance is a CEILING pinned before work starts per G0, so anything found above it is filed as a new item and never folded in or reopened. And the honesty ladder replaces the extra round: an unclearable gate becomes a tracked unverified-reasoned, speculative or reverted status, with G17 counting reasons across a run and surfacing a named capability gap without stalling, because blocking an honest downgrade only incentivizes a false fixed. This preserves autonomy rather than reducing it: the human is escalated to for the aggregate capability gap, never for an individual gate failure. Arbitrary ratio caps, per-MSP budgets and per-round human check-ins were all rejected as the same error in different clothes, replacing a broken rule with an invented one. Supersedes 0380, 0386, 0393, 0394, 0428, 0430 and 0435. Rejected keeping mirror-guard on the grounds that G15's own required receipt is a test that reddens when one copy of a duplicated fact changes; removal proceeds, and any resulting silent-drift exposure is disclosed in the removal PR under G11's test-removal rule.
