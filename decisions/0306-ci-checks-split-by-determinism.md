---
Status: accepted
Date: 2026-08-09T20:48:00.928Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0306. The invariant checks split by determinism: the diff-independent check always gates, the diff-dependent one runs only on pull requests

## Context

The invariant-coverage CI job fails intermittently, and the workflow as written has a specific mechanism that produces exactly that symptom. The failing run logs were NOT read, so the mechanism is named from the workflow and the checker rather than confirmed against a particular failure.

.github/workflows/test.yml:32 runs invariant-coverage-check.mjs with no --event and no --base-ref, although the checker accepts both and contains explicit refusals stating that a pull-request run must not fall back to push mode. The workflow also triggers on an unfiltered push alongside pull_request, so each PR commit is checked twice on two machines under two different diff scopes, and the two runs can legitimately disagree - the same commit, two verdicts, one red.

The checker's inert-basis proof requires a diff and rejects an empty change set outright. So its verdict is a function of code, change set, event type and git fetch state, when only the first of those has anything to do with whether the invariants hold.

Meanwhile invariant-shape-check.mjs reads only the registry and the file tree, making it a pure function of repository contents and incapable of flaking, and it is not wired to CI at all.

## Options

- Split by determinism: the diff-independent check runs always, the diff-dependent one only on pull_request, with push filtered to main - ADOPTED
- Pass --event and --base-ref and keep one combined step - rejected as necessary but insufficient, since the verdict would still vary with the change set
- Add the shape check as a second CI job - rejected, a second clean machine and Node install to run a script that only reads files
- Retry the job on failure until it goes green - rejected, it hides a design fault and trains everyone to ignore the check
- Leave CI until after the implementation steps - rejected, see outcome

## Outcome

Two steps inside the existing invariant-coverage job, separated by determinism rather than by topic.

invariant-shape-check.mjs runs always, with no arguments, because its answer cannot depend on the trigger. invariant-coverage-check.mjs runs with --event and --base-ref supplied from the workflow context, gated to pull_request where a base ref genuinely exists. The push trigger is filtered to main so a PR commit is checked once rather than twice. fetch-depth 0 is already correct on that job.

The effect is that the gate which actually matters becomes a pure function of the repository, so a failure in diff plumbing can no longer turn the invariant verdict red. The inert basis is a convenience that lets a PR skip answering an invariant it cannot reach, and convenience machinery must never be able to block a merge for reasons unrelated to correctness.

Two follow-ons: a pre-push hook running the same commands in the same order, since a local check that differs from CI is worse than none; and required status checks on main, which need no second reviewer or bot account and so remain compatible with a solo repository.

Consequence for sequencing: this becomes step 0, ahead of the deletions. Everything downstream is enforced by these workflows, so a flaking workflow would make every later change look intermittently broken, and a check that cries wolf gets ignored - which is the failure mode that lets a real finding through. Also noted: node-version is pinned to the floating '26.x', so two runs of one commit are not guaranteed the same runtime.
