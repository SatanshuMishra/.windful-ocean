---
Status: accepted
Date: 2026-07-27T22:23:19.623Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0044. Merged main is proven clean by a full-repo scan, because its CI green only covered PR #6's diff

## Context

PR #5 merged at 457d6fa ten seconds before PR #6 at b2f45bb. The sast job is diff-aware on pushes with a resolvable baseline, so the green run at b2f45bb used baseline 457d6fa and scanned ONLY PR #6's diff. The 457d6fa run itself failed at the p/default fetch-verify step -- it still carried pin 39e9e106 against drifted upstream -- so semgrep never executed on Build A's diff at all. Net effect: main was green while the composed tree (Build A + new pin + linear matcher) had never been scanned by CI under the new ruleset. This is exactly the blind spot 0038 flagged, where diff-awareness hides pre-existing findings.

## Options

- Accept main's green sast at b2f45bb as sufficient evidence
- Force a full CI re-scan by pushing an empty commit to main (barred: pushes to origin/main are policy-denied per 0031)
- Scan merged main locally, full-repo with no baseline, using the real pinned ruleset

## Outcome

Option 3. Scanned a detached worktree at origin/main (b2f45bb) with the real ruleset from the human-fetched /tmp/p-default.yml: 507 rules, 294 files, 0 findings, exit 0. This confirms 0035's "Build A is sast-clean under the new ruleset" on the ACTUAL merged tree rather than on c59ca79 in isolation, and it independently re-confirms 0041's finding that the 3 unadjudicated dynamic-RegExp sites (run-engine.mjs:98, mitosis.js:789, design-parser.mjs:166) are not flagged by the real p/default. It also satisfies, for this commit, the "green under ANY baseline" condition 0038 named as the thing that would expose pre-existing findings. STANDING CAVEAT: this is a point-in-time local result, not a CI guarantee. CI remains diff-aware on every push to main with a resolvable baseline, so future pre-existing findings can still hide there. Any change claiming main is clean should re-run the no-baseline scan rather than reading a green diff-aware check as proof.
