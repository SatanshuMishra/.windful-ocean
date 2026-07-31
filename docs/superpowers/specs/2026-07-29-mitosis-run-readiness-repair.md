# Mitosis run-readiness repair

Status: approved, not implemented
Author date: 2026-07-29
Supersedes nothing. Extends `2026-07-28-mitosis-quiescent-advance.md` by selecting a run-readiness subset of M0-M8 and adding the force-push, checkpoint-provenance and collision-safety repairs that spec does not cover.

## 0. Purpose and success condition

Make a mitosis dispatch complete end to end without human rescue, so a target-repo run can be launched from a separate session.

Success condition: a run dispatched against a target repo reaches either every MSP shipped, or an honest park naming a human decision. Neither of these is a success: an engine that halts because a configuration contract cannot be satisfied, and an engine that dies while waiting for a human.

Out of scope: dispatching or re-starting any target-repo run; cutting per-cluster slices; the enhancement half of M0-M8 (M2, M4, M7, M8); install-pin steps 2-4.

## 1. The three-copy hazard (read before touching anything)

Three divergent copies of the engine exist and they are routinely confused.

| Copy | What it is | Boundary layer |
|---|---|---|
| Live install | `~/.claude/*` symlinks resolve into this repository's working tree, so the checked-out branch IS the running engine | absent (checkout predates the wiring) |
| Local `origin/main` ref | stale tracking ref | present |
| Remote main | `6d19499` (PR #14) | present |

Two rules follow, and every MSP below depends on them.

1. Every repair branch is cut from freshly fetched remote main, never from the current checkout and never from the local `origin/main` ref.
2. A repair is live only once its branch is checked out in this working tree. Landing on main and leaving a different branch checked out changes nothing about what executes.

Corollary that makes MSP-9 mandatory: today's checkout has no boundary layer, so it fails open rather than halting. A repaired main has the boundary layer. Checking out repaired main therefore introduces the halt unless MSP-9 has landed.

## 1.5 Engine constraints that shape every repair

Three constraints are load-bearing. A repair that ignores any of them cannot land.

**The engine cannot execute anything.** `mitosis.js` is a Workflow script with zero imports, zero `child_process`, no filesystem, no clock, no randomness. The harness injects only `agent()`, `phase()`, `log()`, `parallel()` and `args`. Every git and gh command the engine appears to run is prose inside an agent prompt, executed by a subagent that self-reports JSON. So no repair may add an engine-side git call. Work that must be deterministic goes into `mitosis-git.mjs`, which is the out-of-process exec layer (spawnSync, argv arrays, no shell) and is deliberately exempt from twinning.

**Twinned logic must be edited twice, byte-identically, in one commit.** Twenty-one whole library files plus one region are inlined into `mitosis.js`; a mirror-guard test asserts the normalized library body appears verbatim inside the engine, and the pre-commit hook runs the full suite, so a half-landed twin cannot be committed. Of the symbols this spec touches, these are twinned: the destructive-operation regex and its classifier chain, the compensation force helper, and checkpoint ref composition. The Parallelize hardening and the ship, restack and reconcile prompt bodies are not twinned.

**Every write to these trees is held for a human.** A guard hook raises an approval prompt on every Edit or Write under `.claude/{hooks,rules,lib,workflows}`, by path or by resolved path. This is ask, not deny, but it means implementers cannot be fanned out unattended; plan for interactive approval per write, or land the carve-out first.

One further consequence: several tests assert the engine's literal prompt prose. Any prompt edit in this spec breaks them by construction, and the assertions must be updated in the same commit.

## 2. Prerequisites (human, before any MSP)

- P1. Fetch and confirm remote main's tip, then re-measure. Measured 2026-07-29: this working tree is 1415/1415/0 and a pristine copy of local `origin/main` is 1559/1559/0, both hermetic, both green; the delta is branch divergence, not breakage. The `1520/1540` figure carried in the ledger and the `1415 pass / 0 fail` figure in the quiescent-advance spec are both stale. Prove no regression by diffing failing-test name sets, never counts.
- P2. Carry the uncommitted Parallelize hardening forward. The working tree holds an unreviewed fix that forces `engineArgs` values to be inlined literals and parks when `tasks[*].fullText` is not a string. A branch cut from main silently drops it. It lands as MSP-0.
- P3. Confirm the guard posture for `.claude/{hooks,rules,lib,workflows}` edits. The worktree-covering guard holds every such edit for a human. Every MSP here edits those trees, so either the 0081 carve-out exists or each edit is human-approved as it happens. This is a throughput constraint, not a correctness one.

## 3. Ordering

Waves are ordered by dependency, not by severity. Within a wave, MSPs are independent.

```
MSP-0  carry the Parallelize hardening forward
  |
Wave A (force elimination)      MSP-1  MSP-2  MSP-3
  |
Wave B (frontier integrity)     MSP-4  MSP-5
  |
Wave C (waiting path)           MSP-6  MSP-7  MSP-8
  |
Wave D (start safety)           MSP-9  MSP-10
```

MSP-9 gates checking out repaired main. MSP-2 must precede MSP-4, because attempt-unique refs change what a recorded sha means.

## 4. MSPs

### MSP-0 — carry the Parallelize hardening forward

Port the working-tree hunks near the Parallelize return contract and the `engineArgs.tasks` validation loop onto the repair branch as its own commit. A patch of the current working diff is preserved outside the repository; re-derive against the new base rather than applying blind, since the base moved by four commits.

Acceptance: a Parallelize return whose `tasks[*].fullText` is a pointer object parks with a named reason instead of interpolating `[object Object]` into implementer briefs.

### MSP-1 — merge instead of rebase at the ship and restack prompts

The ship prompt rebases the integration branch onto the base and then republishes it, and the restack prompt does the same shape. The rebase is what makes the republish non-fast-forward, and the non-fast-forward is what motivates the force retry. Replace the rebase with a merge of the base into the integration branch, and delete the force-retry clause and the preamble sentence that sanctions it.

This is settled doctrine already: "merge the new base into the child. Never rebase a published ref, never force-push one" (`docs/superpowers/specs/2026-07-28-mitosis-quiescent-advance.md`).

Note the distinction that makes this safe here and unsafe elsewhere: engine children are built on parent checkpoint tips that have not been squash-merged, so no squashed equivalent of the parent exists on base to re-diff. The stacked-branch case in a target repo, where the parent HAS squash-merged, is the opposite and must keep its rebase.

Acceptance: the fresh-base ancestry check still passes; no engine prompt contains a force push at a ship or restack site.

### MSP-2 — attempt-unique checkpoint refs

Checkpoint refs are composed per run and unit and reused across attempts, which is the only reason the checkpoint push can ever be rejected non-fast-forward. Make the ref unique per attempt so every push is a new reference, then delete the force retry at the checkpoint push.

Every consumer of the ref shape must learn newest-attempt selection: the ref composer and its parser, the inline twin in the engine, the parent-ref composer, both resume selectors, the reconcile built-set and built-sha readers, the divergence probe, the shepherd, the reconcile prompt's ls-remote page contract and its re-composition step, the persist path, and the restore parse guard.

Two hazards to handle explicitly. The run id is a hash of the spec PATH and base branch, not spec content, so a different spec at the same path reuses the namespace. And checkpoint refs are never deleted by design, so attempt-uniqueness grows the ref set without bound; cap or prune deliberately rather than by accident.

Acceptance: two consecutive attempts on the same unit both push successfully with no force flag anywhere; reconcile selects the newer attempt.

### MSP-3 — retire the force vocabulary

Three residues remain once MSP-1 and MSP-2 land, and each is actively misleading.

- The compensation helper composes a force-push command string that is stored as metadata and never read by any non-test code, in both the library and its inline twin. This dead string is the origin of the "force-with-lease collision" misdiagnosis. Delete it, or consume it, but do not leave it inert.
- The destructive-operation regex matches the lease flag, so any task text quoting the engine's own sanctioned retry is classified irreversible and escalated to a heavier model plus a mandatory security review. With no sanctioned retry left, drop the lease token from the regex.
- Grep the engine and library for remaining force-push prompt literals and remove them.

Acceptance: no force push appears in any prompt the engine hands to a subagent; the escalation classifier no longer fires on the engine's own text.

Rationale for the whole of Wave A: the observed refusal is `Permission for this action was denied by the Claude Code auto mode classifier`, captured on a real lease push. It keys on force-push-shaped commands in unattended contexts, not on prompt text and not on agent identity. Plain and fresh-ref pushes execute in exactly the contexts that block the force. Adding a permission rule does not help: the classifier is not rule-bound, the rule was never actually written to any settings file, and the pattern would not match the engine's `git -C` command shape anyway. Removing the force is the only repair that works.

### MSP-4 — move the checkpoint push behind a deterministic driver

The built sha is harvested only from a subagent's return value. Four paths leave it null: the push agent reports failure, the agent returns without a usable sha field, the dispatch throws, or reconcile finds no matching ref line. A null sha then either parks completed work at the strict frontier gate or, on the relaunch path, ships an unverified tip.

The engine cannot verify the sha itself, because it cannot execute anything. So the repair is not an engine-side check: it is to stop composing git in prose. Add a checkpoint-push verb to `mitosis-git.mjs` that resolves the tip, pushes it to the checkpoint ref, and emits one JSON object carrying the ref, the sha and an explicit landed flag. The engine's prompt then instructs a single command invocation and a verbatim return of its JSON, with no git prose and no branching narrative for the agent to improvise around.

This subsumes most of Wave A. A driver with an argv array and no shell has no force flag to authorize, so there is nothing for the classifier to refuse; the sha is produced deterministically rather than transcribed by a model; and a push that did not land becomes distinguishable from a push whose report was lost. `mitosis-git.mjs` is not twinned, so this lands once.

Apply the same treatment to the ship publish once MSP-1 has removed the rebase from it.

Acceptance: a unit whose push agent dies still records a correct sha if the ref landed, and records an honest failure if it did not; no engine prompt composes a git push.

### MSP-5 — make the frontier gate symmetric

The same-run redispatch path requires sha provenance; the relaunch path calls the same restore with no expected sha and no requirement, so it ships whatever the ref holds. The strict side parks good work and the loose side ships unverified work. Pass the recorded sha and the requirement on both paths.

If a human override is wanted, add it explicitly rather than leaving relaunch as the de facto override. Today relaunch is an override that verifies less than the gate it bypasses.

Acceptance: both paths enforce the same provenance rule; a deliberate override is a named input, not a side effect of relaunching.

### MSP-6 — clear resumePoint on the built transition

The built transition preserves a stale resume point through an object spread, so a unit with a live checkpoint ref is re-executed from an earlier stage. Clear it. This is the M0 repair, already authorized.

Acceptance: a built unit with a live checkpoint ref resumes from the checkpoint, not from plan.

### MSP-7 — honest terminal states

A run that shipped nothing reports failed even when every unit is waiting on a human. Prune the approval-blocked marker when the blocking merge lands, and stop writing a plan-stage resume point into report-only parks. This is M1.

Acceptance: a run whose units are all awaiting human merge reports waiting, not failed.

### MSP-8 — survive human latency

The engine dies while waiting in two independent ways: a bounded merge poll of six cycles at five minutes, and a step budget that counts polling cycles as steps. Any run whose human review exceeds roughly half an hour is killed by its own patience. Replace both with a quiescent exit that ends the run cleanly and a continuation block that says how to resume. This is M3 plus M5.

Acceptance: a run left un-merged overnight exits quiescently with a resume instruction, and resuming ships the outstanding units.

### MSP-9 — boundary posture per 0099 (gates checking out repaired main)

Two layers, two different repairs, both already ruled.

Layer 2 is deleted. It instructs a reconcile subagent to run a CLI that reads its configuration from the environment, while the skill mandates setting those variables inline on the orchestrator's own command. Inline variables bind to one process and never reach the subagent's shell, so a correctly-followed procedure guarantees failure, the CLI exits on a configuration error with no stdout, the verdict comes back absent, and an absent verdict is correctly never read as a pass. Delete the constant, the verdict reader, the prompt item, and the call site, and remove the corresponding skill section.

Layer 1 is reshaped to assert only what the ruleset actually proves. Its identity, admin and review checks are unsatisfiable by construction in a single-owner repository: the owner is not a machine user, admin is true, and the review check fails whenever required approvals are zero. The ruleset that exists is pull-request-required with zero approvals, which is the ratified posture. Gate on a pull-request rule existing in an active repo-owned ruleset; demote identity, admin and approval count to reported observations; and rename the review check so its passing text does not claim review coverage it does not have.

Separately, make the CLI emit diagnostic stdout on every exit path. Today several distinct causes collapse into the same silent absent verdict, which is what made this defect take three sessions to characterize.

Acceptance: a run dispatched from a checkout of repaired main reaches reconcile and proceeds; the gate refuses when no pull-request rule exists and passes when one does.

### MSP-10 — refuse a colliding source prefix at genesis

Holding the source prefix constant across relaunches killed a prior run, and the engine cannot detect it. Three surfaces make reuse dangerous rather than merely untidy: an existing branch with no attached worktree is adopted rather than created, any merged pull request whose head matches the prefix pattern marks this run's unit shipped, and open pull requests are adopted by prefix. The failure is silent adoption of another run's work.

At fresh genesis, when the run is not a relaunch, halt if any branch, pull request, or checkpoint ref already exists under this prefix or run namespace. The engine already holds the open pull requests, merged pull requests and checkpoint ref lines at that point, so no new lookup is needed. Add the matching requirement to the skill's branch contract: the prefix is per logical run.

Acceptance: dispatching a fresh run with a previously-used prefix halts with a named collision instead of silently adopting stale work.

## 5. Deferred, with reasons

| Item | Why deferred |
|---|---|
| M2 derive status from forge and refs | architecture change; MSP-6 removes its defect class for now |
| M4 fixed concurrency cap | the current window signal is incoherent but does not halt a run |
| M7 single divergence predicate | simplification; current direction is already safe |
| M8 CI-to-green loop | new capability; red CI parks honestly today |
| M6 durable run-identity manifest ref | correctness hole only for cross-machine resume |
| Gate self-reference by unresolved path | defense in depth; the install pin supersedes it in practice |
| Install-pin steps 2-4 | robustness for which checkout is live; checking out the repair branch achieves the same thing manually |

## 6. Verification

Each MSP lands as one branch, one commit series, one pull request opened through the centralized tool. Diff-scoped checks per MSP; the full suite at the wave boundaries A, C and D.

Two behavioral proofs are worth more than the unit tests and neither exists yet. First, a run in a scratch repository that pushes a checkpoint, dies, relaunches, and ships from the checkpoint without any force push. Second, a run left un-merged past the old poll bound that exits quiescently and resumes. Build both as receipts; they are the only evidence that Wave A and Wave C actually work.

## 7. Provenance

Grounded in a five-agent audit on 2026-07-29 covering the engine, the ledger on the orphan ledger branch, and the target-repo forensics. Two claims that circulated before that audit are corrected here and should not be reintroduced: the compensation helper does not emit a push and never collided with the destructive-operation regex, and the built sha does not die because a push failed.
