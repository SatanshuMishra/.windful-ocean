---
Status: accepted
Date: 2026-08-10T06:24:18.919Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0315. A commit stranded on a merged stack parent is re-landed from its own branch, so ancestry stays an identity proof

## Context

PR #57 merged chore/retire-invariant-machinery into main at 06:12:23Z; PR #58 merged ci/deploy-receipts-gate into that same parent 9 seconds later at 06:12:32Z. Both report MERGED, but c78c934 never became an ancestor of main, so the repo carried neither invariant machinery nor a fix-verification gate. c78c934^ (41569c1) IS on main, so the commit re-bases onto main with no conflict, which left a genuine choice of re-landing method.

## Options

- Cherry-pick c78c934 onto a fresh branch cut from main, then PR that branch
- Open a new PR from the unchanged ci/deploy-receipts-gate branch with --base main
- Push the two files as a new hand-authored commit on a fresh branch

## Outcome

Re-open from the unchanged branch with --base main. A cherry-pick mints a new hash, so the only check available afterwards is a content comparison — the same weak evidence class as the MERGED badge that caused this. Keeping the branch tip at c78c934 makes `git merge-base --is-ancestor c78c934 origin/main` a literal identity proof after the merge. This holds ONLY under a merge commit: squash-merging rewrites the hash and destroys the proof, so this repo's merge-commit habit (PRs #57 and #58 both produced one) is now load-bearing, not incidental. Shipped as PR #59.
