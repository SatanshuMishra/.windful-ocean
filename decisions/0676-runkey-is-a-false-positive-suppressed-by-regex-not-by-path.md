---
Status: accepted
Date: 2026-08-23T05:27:23.550Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0676. The scanner hit on the recorded run is a false positive, suppressed by shape and never by path

## Context

Pull request 280 merged over two failing checks, neither of them required. One was the known trailing-slash defect. The other was new: the secret scanner reported a generic-api-key hit at entropy 3.86 on the recorded run's plan.json, and the security workflow, green at the previous commit, went red on the trunk. The flagged value is the runKey field, a 64-character lowercase-hex content-derived run identifier that mitosis writes into every recorded run. It is not a credential; its entropy is what trips the rule. It will recur, because every future recorded run writes a fresh one of the same shape. Because the scanner diffs the base tip against the head on a pull request, and the offending commit is already on the trunk, a fix pull request's own scan check passes whether or not the fix works.

## Options

- Add a one-off fingerprint entry for the offending commit.
- Allowlist the evidence and cassette directories by path.
- Allowlist by a regex matching the runKey field shape, optionally scoped to those paths.

## Outcome

Suppress by regex on the runKey field shape, never by path. The sibling files in those directories carry recorded model output from real billed runs, which could one day genuinely contain a leaked credential, so a path or directory allowlist would stop scanning exactly the files most worth scanning. A fingerprint entry alone is rejected because the next recorded run reproduces the finding. Scoping the regex to the evidence and cassette paths is permitted as a narrowing, provided the suppression is still keyed to the shape. The config must extend the default ruleset rather than replace it, or every other detection silently dies. Proof is a full-history scan before and after with the total finding count reported both ways, plus a positive control against a fake sk-ant value; the fix pull request's own green scan check is explicitly not evidence and is to be declared unverified on the pull request.
