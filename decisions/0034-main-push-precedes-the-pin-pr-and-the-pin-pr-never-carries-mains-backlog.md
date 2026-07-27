---
Status: accepted
Date: 2026-07-27T20:36:46.164Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0034. The main push precedes the pin PR, and the pin PR never carries main's unpushed backlog

## Context

Resuming to execute 0033 exposed a flaw in the brief's stated 1-2-3 order. Verified topology: local main is 35 ahead of origin/main (origin/main = c1d2606, local main = cd5c65d); PR #5 head c59ca79 is pushed and matches origin. Because sast is diff-aware (--baseline-commit github.event.pull_request.base.sha), PR #5's baseline is c1d2606, so re-running its checks before main advances would scan 36 commits of surface rather than Build A alone -- making item 2's signal noisy and misleading. Separately, a pin PR branched off LOCAL main would carry all 35 unpushed commits; merging it would land main's entire backlog on origin/main via an agent-opened PR. Also established: the p/default ruleset content was never vendored (c1d2606 added only canonicalize.py and the .sha256), so no local old-vs-new rule diff exists and adjudication must be evidence-driven. And all 21 nosemgrep pragmas across 4 distinct rule IDs are rule-ID-scoped with zero bare pragmas, which structurally forecloses the "suppression silently covers a different rule" risk named in 0033.

## Options

- Brief's literal order -- pin PR branched off local main, merged before the main push -- REJECTED: a 36-commit agent-opened PR that lands main's backlog is a backdoor main push, the same fabricated-consent shape 0031 and this thread exist to eliminate
- Pin PR first, branched off origin/main at c1d2606 as a clean 1-commit PR, main pushed afterwards -- REJECTED by the user: keeps main never-red, but local main then diverges and its 35 commits are ancestors of the already-pushed PR #5 branch, so reconciling needs either a merge commit on main or a rebase forcing a destructive force-push of a reviewed branch
- CHOSEN: human runs `git push origin main` FIRST (plain fast-forward, no rewrite, PR #5 untouched), then the pin PR is branched off the new main as a single commit

## Outcome

USER-SELECTED. The main push is a plain fast-forward that collapses PR #5 to 1 commit and narrows its sast baseline to Build A, and it leaves both the reviewed PR #5 branch and local history untouched. Accepted cost: main's sast badge is RED between the push and the pin PR merge -- caused by upstream p/default drift, not by any code in this repo, and cleared by the very next merge. The pin PR is branched off the NEW main, contains ONLY the re-vendored hash plus any pragma edits the human adjudication produces, and never carries unrelated commits. Adjudication evidence will come from running semgrep 1.170.0 locally against the fetched ruleset twice -- normally and with --disable-nosem -- so every pragma is judged against what it actually hides under the new rules. Blocked on two human actions: the main push, and the `curl` fetch of the ruleset (Bash(curl:*) is a deny rule at .claude/settings.json:56; not routed around, and WebFetch rejected because a mangled fetch would yield a hash CI can never reproduce).
