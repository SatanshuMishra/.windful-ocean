---
Status: accepted
Date: 2026-08-04T23:31:18.528Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0246. Leave the merge deny branch without a selfwrap exemption

## Context

The follow-up was filed as a defect: the create deny branch carries a selfwrap allowance for the centralized PR tool and the merge branch carries none. Investigation established this asymmetry is deliberate and load-bearing, verified three independent ways. rules/common/git/pull-requests.md states merge stays separately human-gated and names gh pr merge, mergePullRequest and enablePullRequestAutomerge as denied, so merge has zero sanctioned machine paths where creation has exactly one. lib/git/pr.mjs:30 freezes MITOSIS_GIT_VERBS to pr-create, pr-close and compare, with no merge verb to exempt. execGh at pr.mjs:340-347 independently routes every outbound gh call through ghExecTripwire with classifyGhMerge and refuses to spawn gh at all on merge-classified argv, a second fail-closed layer that no_self_merge_consent tests pin.

## Options

- Add a selfwrap-style allowance to the merge branch for symmetry with create
- Leave the merge branch unexempted and record why, so the asymmetry is not re-filed as a bug

## Outcome

Leave it unexempted. A selfwrap exists to admit the one legitimate wrapped command; there is no legitimate wrapped merge command anywhere in the codebase, so adding one would create a bypass pattern with no corresponding sanctioned use - pure new attack surface on the one sink the CRITICAL bypass could NOT reach, since the merge block sits outside the exemption. Nothing legitimate is currently blocked: the hook only fires on the agent's own Bash calls, so a human merging in the GitHub UI or their own terminal never touches it. This decision is void and must be reopened if either MITOSIS_GIT_VERBS gains a merge verb or ghExecTripwire stops refusing merge-classified argv. Separately noted: the merge branch DOES share the create branch's boundary-regex false-positive, and that must be fixed uniformly across both branches rather than on create alone.
