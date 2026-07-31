---
Status: accepted
Date: 2026-07-31T21:38:52.431Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0165. CHANGE 3 repeats the H-C error class, and the condemned veto line is false; the P2 PR is blocked

## Context

The P2 branch (fix/m2-monotone-status, 4 commits on test/mirror-census-closure, tip 9e36674) is green at 1818 pass / 0 fail with strong receipts: semantic red-on-parent proven for both shipped changes, two inertness mutations proven, twin parity verified two independent ways, the resurrection guard confirmed untouched, and the done-union confirmed unchanged. A code review and a receipt audit nonetheless returned findings that block opening the PR.

## Options

- Open the PR now and fix the findings in follow-ups, since the branch is green
- Block the PR, fix the false log line and rule on the built-fact narrowing first

## Outcome

BLOCKED until fixed. Two findings are load-bearing. FIRST, the condemned veto log line is FALSE and a new test now pins it: it renders 'the derived status is unchanged' while the code ten lines below rewrites exactly those ids to status parked with a new resumePoint, and it contradicts the RESET line directly above it. The two frontier-train-e2e assertions added in 6b11f25 assert that false sentence verbatim, converting a falsehood into a contract that costs a test edit to correct. In a codebase that builds gates on log lines this is an audit-surface defect, not cosmetics. It ships with a companion fix: the call fabricates a derivation, passing three literals engineered to make advanceVeto return the constant, and vetoLogLine THROWS on an unknown name while that call is unwrapped - so reordering advanceVeto's two branches would crash the reconcile loop. Replace it with the constant directly. SECOND, and the more consequential ruling: CHANGE 3 gates built-resume ref synthesis on builtUnits, which is an agent-REPORTED observation derived from paginated checkpoint-ref pages. A manifest-built unit absent from that observation now gets a null ref and parks for a human, where previously the deterministic ref was tried and would have succeeded whenever the ref existed but the observation had missed it. If the pages come back empty or short, EVERY built unit parks. This is the same error class 0159 refuted for H-C: treating absence from an incomplete listing as evidence of non-existence, where the listing has a known truncation surface. There it was a 200-item PR listing; here it is checkpoint-ref pagination. The new test 'an omitted or unusable built-unit fact carries no id, so no ref is synthesized for anyone' explicitly blesses the failure mode. Required before the PR opens: distinguish an ABSENT or empty observation, which must fall back to the deterministic ref, from a POPULATED observation that omits the id, which may legitimately gate. Also required: delete the frozen transcription in status-fold-characterization.test.mjs, a third textual copy of the fold that mirror-guard does not police and that after the extraction asserts the same goldens as status-facts.test.mjs, so it can no longer catch a production regression while looking like it does. Also required: the branch and PR title must stop claiming a monotone-status fix that 0164 refutes. Deferred, not lost: the emit inside the reduce can abort the fold and discard accumulated transitions if the injected sink throws; and relaunchStateFor seeds 'awaiting' for any id with a provenance-verified open PR, consulting the condemned veto but never the parked one - pre-existing, untouched by this diff, and needing its own investigation.
