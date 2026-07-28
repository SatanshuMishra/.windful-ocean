---
Status: accepted
Date: 2026-07-28T20:57:18.838Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0092. The restored boundary wiring is on main without MITOSIS_BOUNDARY_* provisioning, so every run halts at reconcile

## Context

Code review established that the restored reconcile step 7 runs `node ${BOUNDARY_PREFLIGHT_CLI}` with NO env prefix, on the claim that the preflight reads its config from the environment. The preflight requires MITOSIS_BOUNDARY_ORG/REPO/BASE_BRANCH/MACHINE_USER and exits 31 with zero stdout when they are unset. Measured from a clean env: exit=31, 0 stdout bytes. SKILL.md:37 is the only setter and it sets all four INLINE on the orchestrator's own command; SKILL.md:43 explicitly forbids the ambient path. No ambient export exists in ~/.zshrc or settings.json env. Therefore the agent returns boundaryPreflight=null and mitosis.js halts at stage preflight-boundary. The scheduler tests cannot catch this: they stub the reconcile return with a PROVEN_BOUNDARY fixture and never exec the CLI. Corollary: layer 2 has NEVER functioned end-to-end, not even before 7e2e7d7 severed it. PR #10 was merged during the session, putting this on main at 2c95405.

## Options

- Hold the wiring restore unmerged until provisioning lands (the pre-merge recommendation, overtaken by the merge of PR #10)
- Thread org/repo/base/machine-user into the engine and set them inline in step 7, mirroring SKILL.md:37
- Have step 7 derive ORG/REPO from the literal slug the agent typed in step 2 and BASE_BRANCH from the engine-interpolated baseBranch, with MACHINE_USER as a new required run input
- Revert the wiring restore on main and re-land it together with provisioning

## Outcome

UNRESOLVED and now live on main. The failure is fail-closed (the engine refuses to run; nothing is exposed), so this is an availability blocker, not a security regression. Criterion 3 gains a second code blocker that is independent of the human-applied runbook Sections 2-5: even with the ruleset in place, a run cannot start. The engine currently holds no boundary config to interpolate - grep for machineUser/MACHINE_USER across mitosis.js, engine-args.mjs and branch-contract.mjs returns nothing - so any fix adds a required run input. No fix was authorized or attempted this session.
