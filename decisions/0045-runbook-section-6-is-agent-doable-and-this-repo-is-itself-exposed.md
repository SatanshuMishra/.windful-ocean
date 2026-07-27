---
Status: accepted
Date: 2026-07-27T22:23:33.139Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0045. Runbook Sections 2-6 are not uniformly human-gated: Section 6 is agent-doable, and this repo carries the hazard it describes

## Context

The thread spine carried "runbook Sections 2-6 still UNAPPLIED by a human" as a single human-gated blocker, which framed Build A's activation as entirely outside agent reach. Re-derived from the runbook itself (docs/superpowers/specs/2026-07-26-mitosis-merge-boundary-runbook.md) rather than carrying the summary forward.

## Options

- Carry the spine's 'Sections 2-6 are human-gated' claim forward unexamined
- Re-derive each section's actual gating from the runbook text before charting the successor

## Outcome

Option 2, and the claim was partly wrong. Sections 2-5 ARE human-only GitHub account actions: create the machine user (S2), mint the PAT with Actions:Read (S3), create the ruleset (S4), decide merge strategy (S5). Section 6 is NOT -- it is a workflow YAML edit adding `edited` to the `pull_request` trigger's `types:` list, fully within agent reach. It is also not hypothetical here: .github/workflows/security.yml:3-5 declares a bare `on: pull_request:`, precisely the shape S6 identifies, so a silently retargeted PR keeps showing a green check computed against its old base while CI is meant to be the sole merge authority. CONSEQUENCE: the successor has real unblocked work available immediately and is not purely waiting on the human. CAVEAT carried from the runbook's own verification status: the exact nested key names under `changes.base` in the `edited` webhook payload remain `[unverified]`, so the payload's field-level shape needs a live check at apply time -- but the fact that `edited` fires on retarget is docs-verified and is all the fix depends on.
