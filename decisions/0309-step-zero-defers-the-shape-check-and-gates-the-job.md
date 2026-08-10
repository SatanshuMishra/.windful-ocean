---
Status: accepted
Date: 2026-08-10T00:42:04.710Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0309. Step 0 lands only the workflow properties main can carry, and gates the whole invariant-coverage job

## Context

0306's outcome names two steps inside the invariant-coverage job: an always-run invariant-shape-check.mjs, plus a coverage check gated to pull_request. Implementation found the first one unbuildable on main, because scripts/invariant-shape-check.mjs does not exist there. It is added by 14ffb32 on feat/invariant-inert-registry, which is unmerged, has two of its three commits unpushed, belongs to another thread that is blocked, and sits 64 commits behind main. A workflow that always invokes a missing script reds every run, which is precisely the green-branch invariant that makes a check worth trusting.

Removing that step left the coverage check as the job's only step, which raised a second question 0306 had no reason to answer: what the job should do on a push to main, where the coverage check is gated off.

## Options

- Defer the shape-check step to step (3) and move the pull_request guard up to job level - ADOPTED
- Keep 0306's step-level guard and let the job check out, install Node, run nothing and report green on a main push - rejected, a green check that ran nothing is the false assurance this project refuses
- Stack the PR on feat/invariant-inert-registry so both steps land together per 0306's literal wording - rejected, it gates step 0, which everything downstream depends on, behind a blocked thread with unpushed commits
- Add the shape-check step now and accept a red run until the script lands - rejected, it breaks the green-branch invariant on every PR in the meantime
- Make the shape-check step conditional on the file existing - rejected, a check that silently skips is the convenience machinery 0306 exists to remove

## Outcome

Three property changes shipped: the push trigger filtered to main, the invariant-coverage job carrying if: github.event_name == 'pull_request', and --event/--base-ref passed through step env rather than interpolated into run, since branch names may carry shell metacharacters and a run line is a shell.

The user chose job-level gating over 0306's literal step-level wording, so the job reports as skipped on a main push rather than as a green check that ran nothing. The receipt accepts the guard at job OR step level, so step (3) can move it back down when it adds the shape-check step without editing the test.

0306 is not overturned; its structure is split across two units. Step (3) now owns both wiring invariant-shape-check.mjs AND bringing that script onto main, and until it does, CI runs no shape check at all.

Verified on the real pull_request event rather than asserted: invariant-coverage passed in 9s and the test job ran once rather than twice. Merged as 6e5e08e.
