# Mitosis quiescent-advance architecture

Status: APPROVED (architecture) 2026-07-28 — thread `mitosis-nonstop-shipping-architecture`, criterion 6. Implementation is dispatched in a separate session. Three sub-decisions remain open and gate the MSPs named against them; see §13. M0 remains separately unauthorized.

Date: 2026-07-28. Grounded against `.claude/workflows/mitosis.js` at commit `450804e`; every `:line` cite in this document was read directly at that commit. §3.5, §3.6, and §3.7 additionally record a bounded research pass run on 2026-07-28 (six agents: forge trigger and credential semantics, event reliability, squash-merge restack mechanics, local invoker options, the shepherd advance path, the repository CI and guardrail surface).

Binding decisions: `0065` (redesign via Fable fan-out, under SIMPLE + ROBUST beats FRAGILE + COMPLEX), `0066` (PR-open deferral stays, stacked PRs rejected), `0067` (bounded CI fix loop plus the assertion-line escalation class), `0069` (the advance is a command, not a resident watcher).

## 1. What actually halts a run

The reported symptom — "mitosis stops when a blocking MSP's PR is open but unmerged" — was misattributed to the PR-open policy. It is not the cause, and `0066` settled that the policy stays.

Optimistic building already exists and is default-on: `isBuildable` admits a parent in `built | awaiting | done` (`.claude/workflows/mitosis.js:1909`), and frontier compose stacks a child on its parents' unmerged checkpoint tips (`:4489-4529`), moving the integration ref fresh onto `origin/<base>` at `:4507`. Between two human events there is no agent work waiting at a review boundary. Build-ahead continues during review.

Four mechanisms cause the stop, and all four are in the waiting path, not the building path:

1. **The engine does the waiting.** `MERGE_POLL_MAX_CYCLES = 6` × `MERGE_POLL_WAIT_SECONDS = 300` (`:4703-4705`) means 30 minutes of human *inactivity* exhausts the poll and ends the run. These are module constants; no engine-arg reaches them.
2. **The step budget counts waiting as work.** `maxSteps = units.length * (maxPollCycles + 2) + 1` (`:2021`) is burned by ticks *and* polls alike. On exhaustion the loop breaks past `markAwaitingMerge`, leaving units `planned`, which fall through to `halted.push` (`:4844`).
3. **Waiting is reported as failure.** `computeMergePolicyStatus` returns `failed` whenever `shippedCount === 0` (`:3394`) — so a first run with one PR open for review and one unrelated park reports `failed` despite durable built work on the frontier.
4. **The build-ahead window only grows while the engine is idle.** AIMD events are read exclusively inside `mergePoll.watch` (`:4789-4794`), which runs only after the scheduler has nothing to dispatch. A cold run therefore builds `WINDOW_FLOOR = 3` (`:2141`) ahead and stops growing.

The fix is not more mechanism in the waiting path. It is to take the waiting *out of the engine*.

Note what this diagnosis does **not** say. Polling was never expensive in itself: an authenticated caller has 5,000 REST requests per hour, and conditional requests that return `304 Not Modified` do not count against that limit at all — [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api). The defect is not the network cost of asking; it is that the engine spends its own step budget waiting, and dies when a human is slow. Removing the wait from the engine is therefore the whole fix, and no additional trigger mechanism is required to reach the target capability.

## 2. Goal, and the constraint it is measured against

Target capability:

- (i) a run continues into blocked MSPs while a parent PR is open for human review, without terminating;
- (ii) a shipped MSP's red CI is driven back to green automatically, within a bounded, non-looping failure path;
- (iii) a run resumes from any clone of the repository, not only from the machine that started it.

(iii) is new in this revision. It is not a feature request — it is the correctness property the rest of the design already claims and does not currently have. See §3.5.

Governing constraint from `0065`: a proposal that adds mechanism to reach the target behavior loses to one that reaches it with less. This spec is therefore measured by a mechanism count, not by a feature list. §8 is the scorecard.

Non-goals: agent-performed merges (every merge to any shared branch stays human-gated); changing the PR-open policy (`0066`); unattended relaunch with no human in the session, rejected in `0069` as a trust-model change rather than a mechanism change.

## 3. The engine: quiescent advance

One loop replaces three execution paths. The engine's contract becomes: **derive state from durable facts, advance every actionable unit, exit honestly the moment nothing is actionable.**

### 3.1 State is derived from facts, not folded from the journal

Today three selectors reconstruct resumable state from manifest *status* fields — `selectResumeUnits` (`:2251-2264`), `selectResumeBuilt`, gated on `status === 'built'` (`:2271`), and `selectPreservedBuilt`, wired only to the spec-changed relaunch path (`:3864`) — and a fourth pass rescues built state from live git refs but is blocked by a status/resumePoint guard (`:3706`). Four reconstructions of one question, disagreeing about which is authoritative, is the fragility.

Two questions must be separated, because they have different sources. *Identity* — which units exist, and how they depend on each other — comes from the published run manifest (§3.5). *Status* — where each unit stands — is derived from the facts below, in this precedence order:

| Fact | Source | Meaning |
|---|---|---|
| merged | forge API (PR state `MERGED`) | terminal `done`; squash-merge makes git-level detection impossible, so the forge is the only oracle |
| PR open | forge API | `awaiting` (human review) or `ci-red` (see §4) |
| checkpoint ref exists | `git ls-remote origin refs/mitosis/*` | `built`, with the ref's sha as provenance |
| nothing | — | `planned` |

The "forge is the only oracle" row is a content-addressing consequence, not a platform quirk: a squash merge writes one new commit whose sha is unrelated to anything on the child branch, so ancestry tests (`git merge-base --is-ancestor`, `git branch --merged`) return false for content that is fully present. On a MERGED pull request, `merge_commit_sha` is the sha of that squashed commit — [GitHub REST pulls API](https://docs.github.com/en/rest/pulls/pulls). This retires a previously unverified assumption on the thread and is the sha §7's content comparison reads.

The journal (`.mitosis/run.json`, folded by `applyRunDelta` / `foldRunManifest` at `:524-557`) stays, demoted to a local cache of the published manifest plus the run's own hints (`builtAgainst`, `triedSet`). It is never the skip authority. Where a hint disagrees with a fact, the fact wins and the run logs the disagreement.

Consequence: `resumePoint` stops being state. It is derived per unit at relaunch from the facts above, never carried across a transition. That kills an entire defect class by construction, including the live bug in §9.

### 3.2 One advance loop

The engine currently has three: the tick scheduler (`runScheduleTick:2016-2055`), a flag-disabled streaming duplicate (`runScheduleStreaming:2080-2129`, `STREAMING_DISPATCH_ENABLED = false` at `:2131`), and the reconcile-only shepherd (`runReconcileOnlyAdvance:2904-3047`) reached only through a four-part gate (`shouldReconcileOnly:2675-2677`) that any single parked unit disables, because `hasBuildableWork` counts anything not built/shipped (`:2679-2682`).

The shepherd exists to do exactly what the main loop should already do: restack a built branch when a parent merged, and open a deferred PR when every parent merged. That is `planReconcile`'s output (`toRestack` / `toOpen`, `:2710-2742`) — the same advance the main loop needs. Fold it in:

```
loop:
  facts    <- read forge PRs + git checkpoint refs        (one batched read)
  state    <- derive(facts, published manifest)           (3.1, 3.5)
  advance  <- planReconcile(state)                        (toRestack, toOpen, toParkSubtree)
  actions  <- advance ++ dispatchable(state) ++ buildable(state, K)
  if actions is empty: exit quiescent                     (3.4)
  run actions; persist each result as a delta; continue
```

`planTick`'s dispatch/build selection and `criticalPathOrder` (`:1966-1981`) survive unchanged — they are the part that works. Deleted: the streaming duplicate, the shepherd as a separate path, its gate, and `maxSteps`. The loop cannot spin, because every iteration either performs an action or exits; there is no iteration whose only effect is to wait.

One property of this shape is load-bearing for §3.6 and easy to miss: because every iteration re-reads facts, a merge that lands while the engine is busy is picked up at the next iteration boundary at no cost. The engine needs no trigger to notice a merge while it has work. It needs a caller only once it has none — and at that point it has already exited.

### 3.3 Fixed build-ahead cap K

Delete the AIMD controller (`WINDOW_FLOOR`/`WINDOW_CEILING`/`WINDOW_INCREMENT`, `nextWindow`, `clampWindow` at `:2141-2158`), its durable delta (`persistWindowCheckpoint:4749-4769`, re-persisted by the shepherd at `:2954-2958`), and the review-decision read that exists only to feed it (`readReviewDecision:4730-4740`, `resolveReviewEvent:4742-4747`).

Replace with one constant: `BUILD_AHEAD_CAP = 8` — today's `WINDOW_CEILING`, so the cap is the same ceiling the tuner could ever have reached, not a new number. Optional engine-arg override; the constant is the default. The value itself is open decision (b) in §13.

Two honest caveats, both recorded as risks on the thread:

- The tuner is deleted because its *signal* was incoherent, not because a constant is proven better. It re-counts a persistent `APPROVED` on every poll cycle with no dedup (`:4789-4794`), inflating 3 → 8 from a single approval, while the shepherd path dedups exactly that. A control law that disagrees with itself is worse than a constant.
- Nobody ever instrumented how often divergent invalidation fires, so the cost of a deep-chain rebuild burst is unknown. This spec therefore requires the run to log a per-run divergence count and rebuild-unit count. If that number is material, K becomes an adaptive question again — with data this time.

### 3.4 Quiescent exit and the continuation block

The engine stops the moment `actions` is empty, with no poll cycles burned. It returns a machine-readable continuation block:

```
continuation: {
  status: 'awaiting-approval' | 'ci-red-exhausted' | 'all-shipped' | 'blocked',
  waitingOn: [ { mspId, prUrl, need: 'review' | 'merge' | 'ci' } ],
  relaunchCommand: "<exact argv that resumes this logicalRunId>",
  identity: 'published' | 'local-only'
}
```

`waitingOn` non-empty plus zero genuine parks is `awaiting-approval` — never `failed`, never `partial`. See §6. `identity` reports whether this run's manifest is durably published (§3.5); it exists so that a run which can only be resumed on one machine says so, rather than appearing portable and failing later.

### 3.5 Durable run identity

§3.1 recovers every unit's *status* from the forge and from git refs. It does not recover *identity*, and today nothing does.

The MSP table — `id`, `dependsOn`, `fileScope`, `changeType`, `scope`, `title`, `rationale` — is produced once at decompose time and persisted only in the genesis line of `.mitosis/run.json`, written by a stage explicitly instructed never to commit it (`:3900-3912`). The engine states the consequence itself in a park prose string at `:4329`: the directory "is local-only (gitignored) and does not survive a fresh clone, new worktree, or CI workspace". Confirmed at HEAD: no path under `.mitosis/` is tracked in git. A checkpoint ref (`refs/mitosis/<runId>/<unitId>`, `checkpoint.mjs:1`) is a bare pointer to a commit and carries none of this metadata.

So the durability claim this architecture rests on — any relaunch of the same `logicalRunId`, by anyone, at any later time, resumes from durable facts — holds only on the machine that happens to hold the journal. Everywhere else it is false. That is a correctness hole, not a convenience gap: it is the difference between a run that is resumable and a run that merely appears resumable.

**Publish the manifest.** At run genesis the engine writes the identity table to a mitosis-owned durable ref beside the checkpoint refs, `refs/mitosis/<logicalRunId>/manifest`, and reads it back at derivation.

Rules, kept deliberately narrow:

- **Identity only.** The published manifest carries `id`, `dependsOn`, `fileScope`, `changeType`, `scope`, `title`, `rationale`. It never carries `status`, `resumePoint`, `window`, or `triedSet`. Those derive from facts (§3.1) or remain local hints. Publishing status would recreate the second authority §3.1 exists to delete.
- **Write once, forward only.** Genesis writes it; nothing rewrites it. A park, an invalidation, or a divergence-driven rebuild changes status, not identity. A decompose that changes the MSP table is a different run and therefore a different `logicalRunId` and a different ref.
- **Precedence.** Published manifest beats the local journal's genesis line. On disagreement the published copy wins and the run logs it — the same rule §3.1 applies to facts over hints.
- **Absence is reported, never inferred.** A run started before this lands has no manifest ref. The engine falls back to the local journal and reports `identity: 'local-only'` in the continuation block. The limitation becomes visible at the moment it matters instead of surfacing as an unexplained failure on another machine.

Cost: one ref write at genesis, one ref read at derivation. No new control flow, no new decision, no new failure path that is not already the "forge or git unreachable" path in §12.

### 3.6 The invoker: one command, three callers

The advance is one idempotent function. It has three callers, and no caller is privileged — the advance never asks who invoked it.

| Caller | When it calls | Cost |
|---|---|---|
| the engine's own loop | every iteration, while any action remains | free; the loop already re-reads facts (§3.2) |
| the session agent | immediately after a human merges | one command, seconds |
| any later relaunch, from any clone | next session, another machine, weeks later | the `relaunchCommand` in the continuation block |

These three are the complete set.

Three properties make that sufficient:

- **Idempotence.** Calling the advance twice must be a no-op the second time. Before restacking, a unit already on the current base is skipped — the existing restack path already uses `merge-base --is-ancestor` for exactly this (`:2991`). Before opening, an existing open PR for the head/base pair is reused rather than duplicated — `mitosis-git.mjs pr-create` already observes before it creates (`:277-281`), and the forge's own one-open-PR-per-head/base constraint is the backstop. Idempotence is what makes an over-eager caller harmless and a late caller correct.
- **No waiting state.** While the engine has work it notices merges at iteration boundaries; when it has none it exits and reports. There is no state in which the engine sits and waits, so there is nothing for a caller to race.
- **Liveness is never assumed.** Quiescence is a reported state, not an absence of output. Every stop carries its status, what it is waiting on, and the exact argv that resumes it. A run therefore cannot stall silently: the worst case is a labelled stop that a human resumes, which is strictly better than the mislabelled `failed` of §1.

The residual cost, stated plainly rather than engineered around: a quiescent run advances when a human next acts. If a merge lands and nobody invokes the advance for eight hours, the child MSP's PR opens eight hours later, and its CI starts then. No correctness property depends on that latency — only wall-clock does. §12 records what would have to be true for that to matter, and §11 requires it to be measured rather than assumed.

### 3.7 Restack semantics after a squash-merged parent

The advance's restack step operates on a child whose parent has just squash-merged. That case has a specific shape worth pinning, because it determines where a failure can surface and who must resolve it.

The child branch still physically contains the parent's *original* commits, whose shas are unrelated to the new squash commit. The child's merge base therefore does not advance, and the parent's whole diff reappears against the child. This is git content-addressing, not a forge behavior.

The repair is append-only, consistent with the compensation policy already in force (`push-integration` and `checkpoint-push` are `forwardOnly`, `:2320-2327`): merge the new base into the child. Never rebase a published ref, never force-push one. A rebase would rewrite published history and, by git's documented default, silently drop commits that became empty because their content is already upstream — [git-rebase](https://git-scm.com/docs/git-rebase) — which is precisely the outcome an unattended step must not have to distinguish from a bug. The single `--force-with-lease` at `:4654` remains legal because it retries the ship stage's *own pre-publish* rebase; nothing in the advance may use it.

Most of the apparent duplication is not a conflict at all: identical content on both sides of a three-way merge resolves without intervention. Stacked-branch tooling that syncs by merging rather than rebasing names and auto-resolves exactly this class — [git-town, stacked changes](https://www.git-town.com/stacked-changes.html). A genuine conflict therefore means something entered the squash commit that the child never saw, typically a review fixup. That is a human's to resolve, and the unit parks with the conflicting paths named.

Two operational consequences:

- At restack time the child's PR **does not exist yet** (`0066` defers it), so no forge-level mergeability signal is available. Success or failure is determined at the git level, and "conflict" must be identified positively — unmerged paths in the index — rather than inferred from a non-zero exit code, which also covers refusals to start.
- The forge's automatic base retargeting is irrelevant to this design. It fires only when a merged PR's head branch is deleted, and it repoints a pull request's base field without touching either branch's content — [GitHub: merging a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request). It never repairs the child, and under `0066` there is no child PR for it to act on.

## 4. CI-to-green loop

Today `ship` returning CI-red is terminal: `merged !== true` with `awaitingApproval !== true` falls to `halted` (`:4669-4671`) and parks. There is no surface that drives red back to green. This section adds a new mechanism, under the parameters `0067` made binding.

Research context that shapes it: no surveyed production system fix-forwards a published branch autonomously (rerun-once at Azure DevOps and Google; quarantine-plus-ticket at Meta PFS; revert-first for Chromium sheriffs; eject-to-author with zero retries in GitHub merge queue, bors-ng, Mergify). Repairnator produced 4-5 human-accepted patches across ~30,000 failing builds, and the overfitting literature (Smith et al., FSE 2015) shows patches that satisfy a failing test routinely break unasserted behavior. Green CI is a weak oracle, and it is precisely the signal an auto-fixer optimizes against. The loop is therefore small, hard-bounded, and biased toward escalation.

**Host.** The existing remediation supervisor (`supervisedDispatch:3284-3324`, remediation loop at `:3303-3313`) with its `triedSet` fingerprint discipline. No new supervisor.

**Trigger.** `ship` reports the PR open and CI red on the fresh head+base (the watch at `:4656` already returns a terminal conclusion). Instead of parking immediately, the unit enters the loop.

**Budget.** Hard cap of 3 attempts per PR. Each attempt requires a *new* failure fingerprint, so an identical-failure loop is structurally impossible. Fingerprints are persisted in the park note, so a relaunch does **not** reset the count — without this, §3.6's relaunch and this loop compose into exactly the unbounded loop the SIMPLE + ROBUST constraint forbids. One no-code-change CI rerun is permitted per PR as a flake probe, and it counts as an attempt.

**Publish discipline (append-only on published heads).** A plain fast-forward push, or a forward merge of `origin/<base>`, per §3.7.

**Escalate immediately and unconditionally** — park, do not attempt:

1. implicated paths outside the MSP's declared `fileScope`;
2. CI infrastructure failures;
3. receipts / D6 enforcer configuration;
4. security-classed checks;
5. merge conflicts touching foreign scope;
6. **any candidate fix whose diff touches a file containing a failing assertion.**

Class 6 implements `0067`'s assertion-line class at *file* granularity rather than line granularity. This is a deliberate strengthening, never a weakening: a line-level guard needs a per-framework log parser and must survive post-fix line drift, while the file-level rule needs neither and is a strict superset of it. The cost is over-escalating a case where the test itself is wrong — which is exactly the case that should reach a human. The failing test file is already reported: the ship stage returns the first failing assertion (`:4644`). The granularity is open decision (c) in §13.

**Exhaustion.** Park with kind `ci-red-exhausted`. The PR stays open with red CI visible. The agent never asserts green anywhere; CI remains the sole green authority, consistent with the ratified PR honesty rule and with `PR_NOT_VERIFIED_OPEN_CI` already emitted at PR-open (`:4655`).

## 5. PR-open policy: unchanged

Per `0066`, a child PR opens only when every parent has merged. Deferral (`parentsDone` → `Built` at `:4606-4611`) and the frontier-built redispatch that opens it later (`:4305-4311`) are preserved verbatim. The child's head physically contains its unmerged parents' commits (`:4508`), so opening early would trade the one-MSP-one-diff review contract and the no-force-push invariant for parallel human review of a chain. Since deferral is not what halts runs (§1), keeping it costs the target capability nothing.

One clarification this revision records, because it recurs: under this policy a parent's merge always *precedes* its child's PR. There is no ordering in which a child PR pre-exists its parent's merge, and therefore no race between the two. A parent that merges before the child is even built is strictly cheaper, not harder — the child then builds directly against the merged base and needs no restack at all.

## 6. Honest terminal states

`computeMergePolicyStatus` (`:3377-3396`) is rewritten so that no waiting state can be reported as a fault:

| Condition | Status |
|---|---|
| every MSP merged | `all-shipped` |
| no genuine fault, something in `waitingOn` | `awaiting-approval` (regardless of `shippedCount`) |
| a unit exhausted the CI loop | `ci-red-exhausted` |
| a genuine park, halt, or crash | `blocked` |

The `shippedCount === 0` → `failed` branch (`:3394`) is deleted: zero merges is the *normal* first-run outcome under a human merge gate. Deleted too: `markAwaitingMerge` and the write-only `'awaiting-merge'` state (`:2012-2014`, zero consumers), and `progressPossible` (`:2001-2005`), which exists only to decide whether to keep polling and which under-reports buildable work anyway by calling `planTick` with no window argument, falling back to `WINDOW_FLOOR` (`:1963`).

Two smaller defects fixed in the same pass: `blockedByApproval` is pruned on in-run merge (it is added at `:4694` and never removed at `:4802`), and the end-of-run classifier stops writing `resumePoint.stage: 'plan'` into report-only park records for units that are actually `built` (`:4840-4842`) — under §3.1 that field is derived, so it is simply not written.

## 7. Divergence, without the probe layer

Three mechanisms answer one question today: `runDivergenceProbes` (`:2861-2902`), `assembleDivergenceVerdicts` with four verdicts (`:2684-2708`), and `descendantsToInvalidate` (`:2207-2210`). Collapse to one predicate, `parentDiverged(parent)`, evaluated for all merged parents that gate built work in **one** batched read-only dispatch, and to two states instead of four: `diverged` or `not-diverged`, with every "cannot tell" folded into `diverged`.

Folding uncertainty into rebuild preserves today's safety direction — `indeterminate` and `missing` already flow to not-clean and therefore to invalidation (`:2700-2705`) — while deleting the verdict vocabulary that made that behavior hard to see. The check itself must stay content-based: squash-merge means a merged parent's sha differs from the built tip by construction, so sha equality proves nothing and the comparison is over the parent's declared `fileScope` between `builtAgainst[parent]` (`:4526-4529`) and the merge commit, which is `merge_commit_sha` on the MERGED pull request (§3.1).

## 8. Mechanism ledger

Re-derived from the file at `450804e`, at "control mechanism the engine must reason about" granularity.

| # | Mechanism | Cite | Disposition |
|---|---|---|---|
| 1 | `planTick` + `criticalPathOrder` selection | `:1966-1981` | KEEP |
| 2 | `maxSteps` step budget | `:2021`, `:2085` | DELETE |
| 3 | streaming scheduler (flag-disabled duplicate) | `:2080-2131` | DELETE |
| 4 | AIMD window controller | `:2141-2158` | DELETE → cap K |
| 5 | window durable delta + shepherd re-persist | `:4749-4769`, `:2954` | DELETE |
| 6 | bounded merge poll (cycles × wait) | `:4703-4705`, `:2036-2049` | DELETE |
| 7 | `progressPossible` hypothetical replan | `:2001-2005` | DELETE |
| 8 | `markAwaitingMerge` / `'awaiting-merge'` | `:2012-2014` | DELETE |
| 9 | review-decision read (AIMD's only consumer) | `:4730-4747` | DELETE |
| 10 | divergence probes + 4 verdicts + invalidator | `:2861-2902`, `:2684-2708`, `:2207-2210` | DELETE → 1 predicate (§7) |
| 11 | reconcile-only shepherd + its 4-part gate | `:2675-2682`, `:2904-3047` | DELETE → folded into §3.2 |
| 12 | three resume selectors | `:2251-2318` | KEEP as one derivation (§3.1) |
| 13 | park + transitive cascade | `:2189-2241` | KEEP, fixed (§9) |
| 14 | `resumePoint` stage machine | `:2160-2187` | KEEP, derived not carried |
| 15 | `triedSet` failure fingerprints | `:2184`, `:2257` | KEEP, extended to CI attempts |
| 16 | `planReconcile` frontier advance | `:2710-2742` | KEEP |
| 17 | frontier compose on unmerged parent tips | `:4489-4529` | KEEP |
| 18 | deferred PR-open + built redispatch | `:4305-4311`, `:4606-4611` | KEEP (`0066`) |
| 19 | compensation saga policy | `:2320-2338` | KEEP |
| 20 | remediation supervisor | `:3284-3324` | KEEP, hosts §4 |
| 21 | ship handoff read-back | `:4614-4680` | KEEP |
| 22 | end-of-run classification + merge-policy status | `:3377-3396`, `:4824-4845` | KEEP, fixed (§6) |
| 23 | CI-to-green loop | — | **NEW** (`0067`) |
| 24 | durable run-identity manifest ref | — | **NEW** (§3.5) |

**22 existing mechanisms → 14** (10 deleted, 12 kept, 2 added). Net **-8**, including both new capabilities.

Two reconciliations, stated because the honesty rule requires it.

The previous draft of this table reported net **-9**. That figure was wrong at the time it was written, in the design's own favor: the draft specified a watcher, a heartbeat, and a three-state liveness report in §3.5, and gave none of them a table row, so its additions were undercounted by one. `0069` deletes the watcher, which clears that debt; §3.5's replacement adds exactly one row (the manifest ref). The corrected figure is -8, and it is arithmetic on the table above, not an adjustment of it.

The lost design report recorded `18 → 11`, net -7. That report exists in no surviving artifact, so its row definitions are unrecoverable and this table is not a restatement of it — it is a fresh derivation at HEAD, and it is the spec's authority. The two agree on the property that matters (a net reduction that includes new capability) and differ by rows of granularity; this table additionally deletes the dead streaming path and the step budget.

## 9. The separable bug fix

Independent of this redesign, and pending an explicit go — open decision (a) in §13:

`applyBuiltTransition` (`:473-479`) returns `{ ...msp, status: 'built', ... }`. The spread preserves a stale `resumePoint`; nothing clears it. So: a unit parks at stage `plan` (divergence-condemned, `:3757` / `:3773`) → is later rebuilt, retaining `resumePoint.stage === 'plan'` → an ancestor parks, and the cascade sets `status: 'parked'` while *preserving* `{ ...msp.resumePoint }` (`:2234-2236`), substituting nulls only when the field is absent → on relaunch the guard at `:3706` (`status === 'parked' && resumePoint.stage === 'plan'`) returns early, skipping the git-ref rescue, and the unit re-plans and re-executes despite a live checkpoint ref.

Root cause is one line: a state transition that fails to invalidate a field meaningful only in the prior state. The fix clears `resumePoint` in the built transition. Frequency is unknown — how often divergent invalidation fires was never instrumented, which is the same missing instrumentation §3.3 requires.

Note the original finding 5 (park cascade discards frontier-built work) is refuted as stated: the git-ref rescue at `:3702-3714` does fire on its alleged trigger. Only this narrower vector is real.

## 10. Landing plan

Ordered MSPs, each independently shippable and each leaving the branch green. Order matters: the honesty and derivation changes must land before the deletions that depend on them.

| MSP | Change | Depends on |
|---|---|---|
| M0 | clear `resumePoint` in the built transition (§9) | — (separable; unauthorized) |
| M1 | honest terminal states + `blockedByApproval` prune (§6) | — |
| M2 | derive status from forge + git refs; demote the journal to a hint (§3.1) | M1 |
| M6 | durable run-identity manifest ref: publish at genesis, read at derivation, `identity` in the continuation block (§3.5) — engine change plus `.claude/skills/mitosis/SKILL.md` | M2 |
| M3 | one advance loop, with §3.6's idempotence guarantees; delete the streaming path, the shepherd path, its gate, `maxSteps` (§3.2) | M2 |
| M4 | fixed cap K; delete AIMD, the window delta, the review-decision read; add divergence instrumentation (§3.3) | M3 |
| M5 | quiescent exit + continuation block; delete the bounded poll and `progressPossible` (§3.4) | M3 |
| M7 | single divergence predicate, two states (§7) | M4 |
| M8 | CI-to-green loop with all six escalation classes (§4) | M1, M5 |

M6 keeps its identifier from the previous draft, where it shipped the watcher. It now completes M2's derivation claim instead, which is why it is ordered immediately after M2 rather than late. M5 owes the `identity` field, so M6 landing before M5 keeps that field from being written as a placeholder.

**Structural gotcha that affects M3, M4, and M7.** `mitosis.js` inlines copies of the lib modules — the window block at `:2141-2158` duplicates `window.mjs`, and `planReconcile` at `:2710` duplicates `reconcile.mjs` — policed by a byte-identity mirror guard (`.claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs`). Every deletion must land in both copies in the same commit, or the guard fails.

## 11. Verification

The suite is currently 1415 pass / 0 fail (`npm test`, repo root). Per the test admission gate, new tests are owed only where behavior changes and no coverage exists:

- **Existing tests that pin deleted behavior must be updated in the MSP that deletes it**, not left failing: PR-deferral is pinned in `frontier-train-e2e.test.mjs:301,621` and `mitosis-scheduler.test.mjs:668` (unchanged by this spec, so these must keep passing); the bounded-poll stop is pinned in `leases.test.mjs:375`; AIMD dedup behavior is pinned in `frontier-train-e2e.test.mjs:383`.
- **New coverage owed:**
  - the quiescent-exit continuation block, including `identity`;
  - the manifest ref written at genesis and read at derivation; a workspace with no `.mitosis/` resuming a run correctly from the ref alone; `identity: 'local-only'` reported when the ref is absent; the published manifest winning a disagreement with the local journal;
  - the advance called twice with no intervening change being a no-op the second time — no duplicate PR, no second restack;
  - the CI loop's attempt cap surviving a relaunch (fingerprint durability) — this is the one that, if untested, lets the loop become unbounded;
  - each of the six escalation classes as a deny-case;
  - `awaiting-approval` reported with `shippedCount === 0`.
- **M0** starts with a red test reproducing the four-step sequence in §9.
- `progressPossible` has zero test references today, so its deletion owes nothing.
- **Instrumentation, not a test.** M4 logs the per-run divergence and rebuild-unit counts (§3.3). M5 additionally logs, per quiescent exit, the wall-clock between the exit and the next advance. §3.6 asserts that latency is the design's only residual cost; that assertion is checkable and must be checked rather than assumed.

## 12. Pre-mortem

What would falsify this design:

1. **The residual latency is larger than assumed.** A quiescent run advances when a human next acts. If that gap is routinely long, the user experiences a labelled, correctly-reported stop about as often as today's mislabelled one — quieter and honest, but still a stop. The mitigation is already structural: any relaunch from any clone resumes from durable facts (§3.5), and the exact command is in the report. The honest response to this being real is the M5 instrumentation above, not more engine mechanism; a number would tell us whether the problem is the architecture or the workflow around it.
2. **The CI loop optimizes against a weak oracle.** Three attempts and six escalation classes bound the damage but do not eliminate it; a fix inside `fileScope` that satisfies the failing test while breaking unasserted behavior is exactly the documented failure mode, and it will reach a human as a green PR. Class 6 closes the sharpest hole. Nothing here justifies relaxing the human merge gate.
3. **Fixed K may cost a rebuild burst on deep chains.** Unmeasured, which is why M4 ships the instrumentation.
4. **Fact derivation adds forge dependency to the hot path.** One batched read per loop iteration replaces a journal fold that needed no network. A forge outage now degrades derivation; it must degrade to "cannot advance, exit quiescent, say why", never to a wrong `failed`. The manifest ref (§3.5) shares this exposure and must degrade the same way: unreachable ref means `identity: 'local-only'` and a stated limitation, never a silent fallback that looks portable.
5. **Identity and status could drift apart.** §3.5 forbids status in the published manifest precisely to prevent a second authority. If a later change smuggles status into that ref, the design regresses to the four-disagreeing-reconstructions problem §3.1 exists to delete. The write-once, identity-only rule is the invariant to protect.

## 13. Approval status

Ratified 2026-07-28:

1. **The architecture is approved** (criterion 6). Implementation is dispatched in a separate session.
2. **The invoker model is settled** (§3.6): the advance is one idempotent command with three callers — the engine's own loop, the session agent, and any later relaunch from any clone. That set is complete and closed; the architecture adds no other trigger.
3. **Durable run identity is approved as new work** (§3.5, landing as M6), on the grounds that the durability claim the rest of the design rests on is otherwise false anywhere except the originating machine.

Open, and gating the MSPs named:

- (a) **M0** — authorize the §9 one-line fix as a standalone atomic commit, independent of everything else. Not yet given. Gates M0 only.
- (b) **`BUILD_AHEAD_CAP` value** — confirm 8 (today's ceiling), or a lower value with instrumentation first. Gates M4.
- (c) **Class-6 granularity** — confirm the file-level assertion guard in §4 rather than `0067`'s line-level formulation. Gates M8.

None of the three blocks M1, M2, M6, M3, M5, or M7.
