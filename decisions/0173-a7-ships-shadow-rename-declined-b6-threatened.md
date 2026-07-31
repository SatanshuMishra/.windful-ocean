---
Status: accepted
Date: 2026-07-31T23:50:51.189Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0173. A7 ships as PR #27; shadowing rename declined, B6 threatened against the plan

## Context

A7 was the one Gap 1 item of six that survived 0162's audit. The extraction opened a ctx seam: checkpointRef and transitiveDependents became real imports in divergence.mjs, since normalize() strips bare relative .mjs imports so the twin still matches, while agent, clean, logicalRunId, divergenceProbePrompt and DIVERGENCE_PROBE_SCHEMA arrive through a ctx parameter because plan section 5.3 refuses all five for extraction. SHA_HEX_PATTERN was relocated below divergenceProbePrompt, because a WHOLE census row demands the module body be contiguous inside mitosis.js. Code review returned approve-with-fixes with two MEDIUM findings: untested error branches, and ctx destructure targets that shadow live outer bindings. Plan section 10 separately predicted B1-B6 not-threatened for this PR class.

## Options

- accept both review findings
- accept the tests, decline the rename
- accept neither
- rename only

## Outcome

TESTS ACCEPTED, RENAME DECLINED. The missing-branch finding was real: every fail-closed error branch was untested and ctx.clean had zero assertion coverage, so a mis-threaded clean, the exact failure mode this refactor risks, would have shipped undetected. Two tests were added; the agent-throw test asserts the QUOTED message, proving ctx.clean was applied rather than interpolated raw. The rename was declined because renaming the destructure targets in both copies would touch four-plus use sites and destroy the property that the extracted body is byte-identical to the text production already ran, the strongest evidence this PR changes nothing; mirror-guard already closes the dangerous path, since deleting the destructure line fails the census. B6 ships THREATENED against the plan's prediction: divergence.mjs has no production importer and cannot have one, because mitosis.js runs in a sandbox that denies import, so dead-export lint reads the twin's own copied text as liveness. Receipts: npm test 1820/1820/0, coverage gate ok on all 12 ids, byte-identity re-derived independently of the guard with the normalized body occurring exactly once. Four commits, 245 changed lines, PR #27, all CI checks green, merge human-gated.
