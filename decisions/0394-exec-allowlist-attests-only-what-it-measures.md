---
Status: accepted
Date: 2026-08-13T18:36:33.345Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0394. exec-allowlist declines the child_process census and names in the verdict what it does not attest

## Context

A reviewer raised a HIGH against A4: exec-allowlist attests containment it never measures, and asked for a closed census over every child_process call site so the verb would prove containment rather than assert it. The shipper verified the basis rather than accepting or dismissing it: four live non-test node:child_process imports exist (run-store.mjs:1, gh-merge-shim.mjs:2, dispatch.mjs:1, generate-run-script.mjs:2), and exec-policy's only non-test caller is the gate's own probe. Such a census would therefore be RED at this commit.

## Options

- Ship the closed census over every child_process call site - rejected: it is red at this commit, and a red leg in the deployed receipts template turns the enforcer red for every PR in the stack
- Keep the verb's "probed" field claiming a containment path it never opened - rejected: a false attestation is worse than an absent one, the same reason the PR honesty rule exists
- Decline the census, delete the false attestation, and emit explicit attests and notAttested arrays naming the uncensused spawn sites - CHOSEN
- Defer the whole exec-allowlist verb to a later MSP - rejected: SPEC 3.2 names it as one of the two layers proving the no-merge guarantee in CI

## Outcome

The verb proves what it measures and names what it does not. The false "probed" field is gone, --target is rejected for this verb, and the verdict carries explicit attests and notAttested arrays naming the uncensused spawn sites, so the decline is machine-visible rather than hidden in prose. Whoever later routes those four call sites through exec-policy can turn the census on, and the notAttested array is the work list. A separate residual survives and is named in the PR risk line: narrowing MERGE_REFUSAL_SPECIMENS from seven probes to one leaves the verb green, because it asserts each probe is refused but never that the probe set is complete. The verb's own red case still holds - deleting the pre-spawn merge refusal reddens it at exit 41.
