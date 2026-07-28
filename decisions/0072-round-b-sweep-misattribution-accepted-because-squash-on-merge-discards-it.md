---
Status: accepted
Date: 2026-07-28T19:25:30.205Z
Thread-Id: 01KYKS3C7VP16PXMP7D9G0TMHW
---

# 0072. Round B git add -A misattribution accepted, not rewritten

## Context

Round B of the guard hardening ran `git add -A` and swept Round A's in-flight files into 3 commits on fix/pre-tool-use-guard in DevLabs/continuity-ledger-plugin. No content was lost and the suite was green at d102fb8 (622/622); the damage is attribution only. The clearest instance: src/util/git-env.mjs exists ONLY in commit 8962003, whose message is about the tripwire, not about the git-env split. All 30 commits were unpushed when the question was raised, so a rewrite carried no remote consequence. This was one of two user calls the predecessor thread could not make and handed forward.

## Options

- Accept the misattribution as-is and record it
- Interactive-rebase to re-split the 3 sweep commits so each file lands in the commit whose message describes it
- Leave the question open a third time

## Outcome

Accepted as-is on 2026-07-28 by explicit user ruling. Decisive reason: rules/common/git/branching.md makes squash-on-merge the integration default, so every commit on this branch collapses into ONE published commit whose subject is the PR title. Intermediate commit attribution therefore never reaches published history, which makes a history rewrite pure risk for zero downstream payoff. The misattribution is recorded here so the branch's own log is not later mistaken for an accurate account of which change introduced src/util/git-env.mjs.
