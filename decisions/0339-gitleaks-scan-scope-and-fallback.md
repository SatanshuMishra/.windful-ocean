---
Status: accepted
Date: 2026-08-11T16:39:09.471Z
Thread-Id: 01KZQRFXW2YE3JXDBEWQ84CTVQ
---

# 0339. Keep the secret scan diff-scoped, and prefer a bounded full scan over a silent green

## Context

Dropping the gitleaks wrapper meant re-deriving the commit range ourselves, which the wrapper had been doing implicitly. Two questions fell out. First, whether to take the opportunity to scan full history: rejected, because it is a separate behavior change from removing the api.github.com dependency, and because it would immediately go red on a known false positive at .claude/lib/superpowers-parallel/tests/reconcile.test.mjs:78, where synthetic short hex strings stand in for git object IDs and trip the generic-api-key rule. Second, what to do when no baseline resolves. The first draft used --log-opts="-1", scanning only the tip commit. The security reviewer built a scratch repo with a leak two commits back and demonstrated that arm scanning 1 commit and exiting 0 — the gate going GREEN on a real secret. That arm is reached on more than the new-branch case: the git cat-file existence guard also empties the ref on a force-push that rewrites history, which is precisely when a scan matters most. The reviewer also tested and eliminated two plausible-looking alternatives: --not --remotes=origin scans 0 commits green on a new-branch push, because the branch is already a remote ref by then; and origin/DEFAULT..HEAD is empty when HEAD is the default tip.

## Options

- Keep diff-scoped with a tip-only fallback - REJECTED on demonstrated evidence, it exits zero on a secret introduced earlier in the same push
- Switch to full-history scanning - rejected as a separate behavior change that also trips a known false positive, and it would have to ship with an ignore file papering over that
- Three-arm fallback: resolved baseline, else the range against the default branch, else a full scan - ADOPTED
- Accept the silent-green edge case as tolerable because the pull_request run covers the range anyway - rejected, since nothing in the repo requires a PR, this is a solo owner-held repo, and for a secret scanner time-to-detection is the product

## Outcome

Scanning stays diff-scoped, reusing the baseline-resolution step the sast job already uses. Where no baseline resolves, fall back to the range against refs/remotes/origin/DEFAULT (verified available under fetch-depth 0), and only where that is unavailable or empty, scan full history. That last arm is a deliberate, bounded deviation from the never-full-history constraint: it fires only on a first-ever push to the default branch, and the alternative it replaces is a gate that passes a real secret in silence. The ordering matters and is not cosmetic — do not collapse these three arms back into one. A green run must mean scanned-and-clean, never scan-skipped.
