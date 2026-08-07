# Mitosis core: cost, decomposition, stacked PRs (SPEC B)

Status: designed, not implemented. Authored 2026-08-06.
Governing decisions: 0265 (merge-commit for dependent chains, squash retained for standalone PRs), 0267 (the Workflow runtime forbids dynamic import, so codegen is the only path off the twinning tax), 0268 (two SPECs; SPEC B covers cost, decomposition and stacking; the fix pipeline is dropped), 0271 (SPEC B leads with the cost instrument and writes every cost target as a falsifiable hypothesis).

This SPEC is standalone. It inherits no decision numbers, no step chain, and no citation authority from `~/Downloads/2026-07-30-mitosis-core-rebuild.md`. Every line citation below was re-derived on 2026-08-06 against the repository at `chore/config-drift`; section 0.6 lists the five that did not survive that re-derivation.

Goal, in one sentence: make the engine's token and latency cost measurable before changing it, then reduce that cost through changes that can be proved wrong, decompose the monolith by the only mechanism the runtime permits, and replace the blocking-PR architecture with stacked PRs so the engine keeps producing while a human merges.

## 0. Verified ground truth (re-derived 2026-08-06)

### 0.1 The measurement vacuum — the fact that orders this entire SPEC

**No token or tool-call accounting exists anywhere in the engine.** There are no run journals. The only `tokens` identifier in `mitosis.js` is a glob tokenizer at `.claude/workflows/mitosis.js:988-997`.

Every cost claim this SPEC would like to make is therefore unmeasurable today, and every cost claim the 2026-07-30 document made was unmeasurable when it made them. That document proposed an instrument counting dispatches and wall-clock only — an instrument that would score a change as a win even if token cost rose, because it could not see tokens at all. This is the precise defect this SPEC exists to avoid, and it is why the instrument is Part I and nothing may be tuned before it lands.

### 0.2 The runtime surface the engine executes in

Measured 2026-08-06 by a zero-agent probe through the real Workflow tool (decision 0267). Verbatim: `require` undefined, `process` undefined, `module` undefined, `fetch` undefined, `globalThis` object, `Function` available, the workflow hook a function, and all three dynamic imports failing identically with `import() is not available in workflow scripts.`

Two consequences carried through this document. Dynamic import is refuted by direct measurement, not assumed — so the inline twinning of ~25 modules is structural and permanent. And the sandbox validator is a **source-level** check: a probe was rejected merely for containing the identifiers `Date` and `Math.random` inside `typeof` expressions, so generated output must avoid those identifiers **textually**, not merely avoid calling them.

**The probe did not test `budget`.** This matters and section 2.2 treats it as open rather than settled.

### 0.3 Engine census

| Fact | Value | Citation |
|---|---|---|
| `mitosis.js` size | 5,515 lines | `.claude/workflows/mitosis.js` |
| `agent(` occurrences | 31, of which `:1267` is a re-dispatch wrapper | `.claude/workflows/mitosis.js:1267` |
| `pipeline(` call sites | 0 | — |
| `workflow(` call sites | 0 | — |
| `parallel(` call sites | exactly 1 | `.claude/workflows/mitosis.js:1449` |
| `guard.dispatch(` sites | 8 | `.claude/lib/superpowers-parallel/run-engine.mjs` |
| Explicit `model: 'opus'` pins | 4 | `mitosis.js:1374`, `:5000`, `:5027`, `:5187` |
| Modules mirrored verbatim inline | 25 of 37 census rows classified WHOLE | `.claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs` |
| Inline `runEngine` twin | defined `:1272`, invoked `:5040` | `.claude/workflows/mitosis.js` |

Loop bounds that multiply cost: `MAX_PLAN_REVIEW_ITERATIONS = 3` (`mitosis.js:1721`), `REMEDIATION_BUDGET = 4` (`:2109`), `CI_ATTEMPT_CAP = 3` (`:2257`), `BUILD_AHEAD_CAP = 8` (`:2582`, an inline twin of the canonical `.claude/lib/superpowers-parallel/window.mjs:1`).

Growth evidence for the decomposition goal: `mitosis.js` went from 4,717 to 5,515 lines across 30 commits between 2026-07-24 and 2026-08-04, near-monotonic.

### 0.4 The pre-code exploration path

On a 6-MSP run, roughly **24 dispatches independently open the repository before the first line of code is written**: three run-level explorations (Reconcile, Decompose, Prepare) plus three to four per MSP (Plan, Plan review, Parallelize, Branch).

Carried prompt bytes by phase, with site counts: Ship 26,354 (13); Reconcile 14,826 (3); Branch 4,183 (2); Parallelize 3,704 (1); Decompose 3,365 (1); Prepare 2,558 (1); Plan 1,648 (2); Plan review 346 (2).

Two specific observations. Decompose and Parallelize **both** derive dependency facts through Serena/LSP — overlapping work. And the plan-review prompt is 171 characters, too small to carry its own subject, so the reviewer must fetch everything it reviews.

**The counter-finding, which bounds all of this.** `task.fullText` is passed *inline as payload* to the implementer and fix dispatches at `run-engine.mjs:339`, `:350`, `:366`, `:376`, `:386` and `:392`, and an explicit anti-re-derivation instruction already exists in that prompt set. Implementers do **not** re-read the plan. The re-derivation pathology is concentrated in the **planning stack**, not spread across the engine. A change premised on implementers re-reading their own task would be fixing something already fixed.

### 0.5 The blocking-PR mechanism, and the machinery that exists only because of it

**Mitosis never merges.** `merge-policy.mjs` carries exactly one policy: `normalizeMergePolicy()` at `.claude/lib/superpowers-parallel/merge-policy.mjs:15-17` returns `MERGE_POLICY_HUMAN_GATED` unconditionally, ignoring its input.

Every PR is opened with `base = baseBranch` — the ship prompt hard-codes that contract at `mitosis.js:5338`. There is **no PR stacking today**. Dependency order survives only as `--depends` metadata, built by `prDependsFlag` (`mitosis.js:3516`, used at `:5338`).

What exists instead is the frontier-train: when an MSP is blocked behind an unmerged parent, the engine stacks **local** durable checkpoint refs in dependency order and builds on top (`mitosis.js:5000` for the frontier-compose dispatch, `:5027` for the normal path), then returns Built and refuses to ship, bounded by `BUILD_AHEAD_CAP = 8`.

Three pieces of compensation machinery exist **only because the PR cannot be opened early**, and stacked PRs should therefore **delete** them rather than extend them:

- divergence detection — `.claude/lib/superpowers-parallel/divergence.mjs` (75 lines) and its inline twin
- the supersede path — `supersedeOpenPr` at `mitosis.js:4564`
- part of the transitive re-park cascade — `transitiveDependents` at `.claude/lib/superpowers-parallel/parking.mjs:34`

### 0.6 Citations that did not survive re-derivation

Recorded so no future session re-inherits them.

1. **`BUILD_AHEAD_CAP` is not declared in `leases.mjs`.** It is *imported* at `leases.mjs:2` from `window.mjs`; the canonical declaration is `window.mjs:1`.
2. **There are four explicit opus pins, not two**, and none is at the previously cited `:5176` or `:5329`. They are at `mitosis.js:1374`, `:5000`, `:5027`, `:5187`. Separately, the model-policy functions at `mitosis.js:1156-1176` *return* `'opus'` as a conservative default, which is a different mechanism from a pin.
3. **The schema constants are not a contiguous extractable block.** The claim of ~445 contiguous lines at 1562-2007 does not hold: there are 26 top-level `*_SCHEMA` declarations scattered from `mitosis.js:977` to `:5425`. The "free win, 8% of the file, near-risk-free" framing is withdrawn — see section 4.3.
4. **`PR_TITLE_PATTERN` is not declared at `pr.mjs:152`.** It is imported at `.claude/lib/git/pr.mjs:11`, re-exported at `:23`, and *applied* at `:152`.
5. **`reviewLoop` spans `run-engine.mjs:397-409`**, not the previously cited range: `while (true)` at `:397`, the review dispatch at `:400`, the fix dispatch at `:409`.

6. **Ship's dispatch count is unsettled, not merely uncited.** The two prior censuses give 11 and 13; `phase: 'Ship'` occurs 15 times today. See H3 — the SPEC adopts none of them.

New fact, not previously recorded: **`gh pr edit --base` is not blocked by the bash gate.** The gate matches `pr edit` only in conjunction with `--title`, `--body` or `--body-file` (`.claude/hooks/block-destructive-bash.sh:134`). Section 5.5 depends on this.

## 1. What this SPEC changes, and the order it changes them

Three changes, in a fixed order, each of which is a precondition for judging the next:

1. **Part I — the instrument.** Token and tool-call accounting, landed alone, producing a baseline.
2. **Part II — cost reduction**, expressed only as hypotheses the instrument can refute.
3. **Part III — decomposition** of the monolith by codegen, and **Part IV — stacked PRs** replacing the blocking-PR architecture.

The order is not preference. Parts II, III and IV all claim to reduce cost, and none of those claims can be evaluated before Part I exists.

## 2. Part I — The instrument

### 2.1 What it must count

Per dispatch site, per phase, per MSP, per run:

- **input tokens** and **output tokens**, separately — not a combined figure
- **tool calls** made by the dispatched agent
- **wall-clock**, split into engine-active time and time waiting on a human

Tokens are the primary metric and the reason this section leads. Dispatch count and wall-clock are secondary and are recorded, never optimized against on their own. A change that halves dispatches while raising tokens is a regression, and an instrument that cannot say so is not an instrument.

The human-wait split is load-bearing for Part IV, which is justified on latency grounds — see H5.

### 2.2 Two candidate sources, one of them unmeasured

**Source A, in-sandbox: the runtime `budget` global.** The live Workflow tool contract documents `budget: {total, spent(), remaining()}`, where `spent()` returns output tokens spent across the main loop and all workflows. If present, a delta around each `agent()` call attributes output tokens to a dispatch site with no external machinery.

Three limits, all from the contract itself, and one gap:

- it reports **output tokens only**, and the prompt-carrying dispatches in section 0.4 are input-heavy, so Source A alone cannot measure the thing this SPEC most wants to measure;
- the pool is **shared across the main loop and all workflows**, so a delta taken around a dispatch inside `parallel()` attributes nothing reliably;
- `budget` is absent from `HOOK_NAMES` in `.claude/lib/superpowers-parallel/workflow-sandbox.mjs:36`, so the local sandbox model does not know about it;
- **the 2026-08-06 probe did not test `budget`.** Its presence in the real runtime is documented but not measured.

**Confirming `budget` empirically is the first act of this MSP**, by the same zero-agent probe method that settled 0267. Do not build on Source A before that probe returns, and do not read this section as though the question is settled.

**Source B, out-of-band: the workflow transcript.** A workflow run persists per-agent transcript records and a journal under its session transcript directory. A hook runs in real Node with full filesystem access and no sandbox restriction, so it can read those records after a run and fold them into a run journal. If those records carry input and output token usage, Source B measures what Source A structurally cannot.

**Both sources must be checked before the instrument's shape is fixed.** The likely outcome is that Source B is the real instrument and Source A is a cheap in-run signal, but that ordering is a prediction, not a finding.

### 2.3 The run record

One durable, append-only journal per run, written outside the engine, carrying a row per dispatch: run id, MSP id, phase, label, agent type, model, input tokens, output tokens, tool calls, wall-clock, and outcome. Rows are facts, never judgments; no row carries a verdict about whether a cost was acceptable.

The journal must survive the run that produced it, because every hypothesis in Part II is a comparison between two runs.

### 2.4 The baseline

Before any change in Parts II, III or IV, the instrument records a full multi-MSP run against the engine **as it exists today**. That run is the baseline every later hypothesis is measured against.

A baseline from a single run is a sample of one. State the run count and the variance in the recorded baseline; do not present one run as a measurement.

### 2.5 Why the instrument lands alone

The instrument ships as its own unit, merged, with no cost-reduction change riding along. A combined change cannot distinguish an improvement from a measurement artifact, and a first instrument is exactly where measurement artifacts live.

## 3. Part II — Cost reduction, as falsifiable hypotheses

### 3.1 The form, and the universal falsifier

Every cost target in this SPEC is a hypothesis with five parts: **claim**, **mechanism**, **measurement**, **falsifier**, and **disposition if falsified**. None is a budget. A budget asserts a number and invites the engine to be shaped until it hits it; a hypothesis asserts a number and names the observation that would kill it.

**The universal falsifier: total input plus output tokens across the affected phase must fall against baseline. If they do not, the hypothesis is refuted regardless of what happened to dispatch count or wall-clock.**

This applies to every hypothesis below without restatement. It exists because fusing two dispatches into one does not divide cost — the fused agent carries both contexts, and if it must re-read to serve both purposes, the fusion can cost more than the pair it replaced.

### 3.2 The hypotheses

**H1 — Pre-code exploration collapse.**
Claim: the ~24 dispatches that open the repository before the first line of code (section 0.4) can be reduced by fusing the three run-level explorations, without raising total pre-code tokens.
Mechanism: Reconcile, Decompose and Prepare each open the repository cold and independently; one agent opening it once and returning all three products does the same work with one context load.
Measurement: total input and output tokens plus tool calls across the pre-code phase set, baseline versus fused.
Falsifier: the universal falsifier, or a rise in tool-call count showing the fused agent re-reading to serve three purposes.
Disposition: revert the fusion. Dispatch count was never the cost.

**H2 — The Decompose/Parallelize dependency overlap.**
Claim: deriving dependency facts once and passing the edges forward costs less than deriving them twice.
Mechanism: both phases independently derive dependency facts through Serena/LSP (section 0.4).
Measurement: tokens and tool calls attributable to dependency derivation specifically, counted at both sites, baseline versus single-derivation.
Falsifier: the two derivations answer genuinely different questions — Decompose asks where to cut, Parallelize asks what is safe to run concurrently — and a single derivation serving both at the required fidelity costs more than two narrow ones.
Disposition: keep them separate; the overlap is nominal rather than real.

**This is the hypothesis the 2026-07-30 document carried with no falsifier at all.** It was that document's only load-bearing allocation and its least evidenced. It is stated here with the falsifier that was missing.

**H3 — Ship's conditional surface.**
Ship carries 26,354 prompt bytes (section 0.4), the largest of any phase by a factor of nearly two, making it the most expensive phase per MSP. The 2026-07-30 document budgeted it at **1 dispatch** with no happy-path subset established anywhere.

**Ship's dispatch count is itself unestablished.** Three figures are in circulation and they disagree because they count different things: 11, 13, and the 15 occurrences of `phase: 'Ship'` measured today — the last a superset, since remediation descriptors carry a phase alongside dispatch options. This SPEC does not adopt any of them. That the most expensive phase in the engine cannot currently be counted is itself an argument for Part I.

This SPEC does not restate that number. **The happy-path subset must be measured before it is hypothesized about.** The instrument records which Ship sites actually fire on runs that end green; only once that subset is known does a collapse hypothesis get written, with its own falsifier.
Falsifier for the premise itself: if the observed happy-path subset is not small, there is no Ship collapse to make and Ship is left alone.

**H4 — The plan-review payload.**
Claim: passing the plan inline to the reviewer costs fewer total tokens than making the reviewer fetch it.
Mechanism: the plan-review prompt is 171 characters and cannot carry its subject, so the reviewer fetches everything. The implementer path already does the opposite and is cited as the working precedent (section 0.4).
Measurement: plan-review phase tokens and tool calls, baseline versus inline.
Falsifier: the inline payload raises input tokens by more than the fetches it removes — plausible, because the reviewer may need only part of what would be passed whole.
Disposition: keep the fetch.

**H5 — Where the latency actually is.**
Claim: the dominant plan-to-ship latency is time waiting on a human merge, not engine-active time.
Mechanism: `merge-policy.mjs` has exactly one policy and mitosis never merges (section 0.5), so every dependent MSP waits on a human.
Measurement: wall-clock split into engine-active and waiting-on-human, from the baseline run.
Falsifier: engine-active time dominates.
Disposition if falsified: **Part IV loses its latency justification** and must stand or fall on architecture grounds alone — the deletion of the compensation machinery in section 0.5. Say so explicitly rather than quietly keeping the stacking work.

### 3.3 One optimization this SPEC rejects in advance

The `reviewLoop` at `run-engine.mjs:397-409` rebuilds its prompt every iteration and re-issues `git diff <launchCommit> -- <fileScope>` from scratch. Caching that diff across iterations looks like a free win and is not: the fix dispatch at `:409` runs **between** iterations and changes the tree, so a cached diff would be stale by construction and the reviewer would review the previous iteration's state.

The recomputation is necessary. If loop cost is a target, the target is the iteration count, not the diff. Recorded here so a future session does not rediscover this as an opportunity.

## 4. Part III — Decomposition by codegen

### 4.1 Codegen is the only path, and this is measured rather than assumed

`mitosis.js` is 5,515 lines largely because the runtime executes it as `new AsyncFunction(...)` with no module resolution, forcing ~25 clean `.mjs` modules to be hand-copied verbatim inline and kept in sync by a mirror-guard test. Decision 0267 refuted the escape hatch by direct measurement: dynamic import fails in production, not only in the local test sandbox. The twinning tax is structural and permanent.

That leaves generation. Hand-copy plus a drift-detecting test becomes generation plus a regeneration check.

### 4.2 What is generated, and what is committed

The generated `mitosis.js` is **committed**, not built at load time. The Workflow tool reads the file from disk, and under SPEC A that file becomes release content built by `git archive`, which carries only tracked content. An untracked build artifact would never reach a release.

So: canonical `.mjs` modules are the source of truth, a generator concatenates them into `mitosis.js`, and the result is committed. `mirror-guard.test.mjs` changes role from "diff the two hand-maintained copies" to "regenerate and assert the committed artifact matches" — a strictly stronger check, because it fails on a stale artifact as well as on a drifted one.

In-repo precedent exists at `.claude/lib/superpowers-parallel/generate-run-script.mjs:19-32`, which generates a workflow script from engine source by line-oriented substitution. **It is precedent for generating a workflow script, not for concatenating modules** — the mechanism differs and the generator is new work, not an extension.

### 4.3 The seam inventory

Ordered by risk, lowest first:

- **Already mirrored and seamable, low risk:** identity/manifest, run-log fold, cluster derivation, the gate-config guard, the cross-MSP scheduler, parking, saga, CI classification. These already have canonical twins, so generation is mechanical.
- **Medium:** checkpoint/reconcile/divergence, which are genuinely coupled and must be kept as **one** seam rather than split into three; and supervisor/remediation/retry/outcome, which fold into one.
- **Not seamable, no twin anywhere:** `runUnit` (`mitosis.js:4691` onward, carrying most of the engine's dispatch sites and most of its prompt text) and the Reconcile run-setup, whose halt checks are order-sensitive. If `runUnit` is ever split, split it **by stage**, never by prompt-versus-logic — the prompts are what make the stages coherent.

**The schema-extraction "free win" is withdrawn.** Section 0.6 item 3: the 26 schema constants are scattered from `mitosis.js:977` to `:5425`, not contiguous. Extracting them is a normal seam of ordinary risk, not a near-risk-free 8% cut, and it should be sequenced on its merits.

One structural note bearing on measurement: the prompt-text share of the file is undercounted by any line-based census, because prompt lines are far denser than code lines. A true measure sums string-literal lengths per dispatch site. Do not size this work from line percentages.

### 4.4 Constraints the generator must satisfy

- Generated output must not contain the identifiers `Date` or `Math.random` **textually**, because the validator is a source-level check that rejected a probe for mentioning them inside `typeof` expressions (section 0.2). The current engine satisfies this already: both appear zero times in `mitosis.js` today.
- Generated output must contain no module-level `import`/`export` statement and no `import()` call form. **The bare words are not banned**, and must not be: `import` and `require` appear as substrings in `mitosis.js` today — at `:144-154` as config key names and at `:1313`, `:1322`, `:3464`, `:3528` and `:4900-4906` inside prompt strings, including instructions telling a subagent to write import statements of its own. All of it passes the validator. A generator that stripped them textually would corrupt prompts and break the byte-identity proof of section 4.6.
- Generation must be deterministic: identical sources produce a byte-identical artifact, or the regeneration check is not a check.

### 4.5 Both existing harnesses misrepresent production, in opposite directions

Correcting them is part of this work, because a decomposition validated against a wrong harness is not validated.

- `.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs` rebuilds the engine with `new AsyncFunction` in real Node — **more permissive** than production.
- `.claude/lib/superpowers-parallel/workflow-sandbox.mjs` models a surface that does not match the probe: its `HOOK_NAMES` at `:36` omits `budget`, and its determinism policy bans `Date` and `Math.random` as *policy* rather than as the source-level rejection production actually performs.

Both are corrected against the 0267 probe result, which is the only measured description of the real surface.

### 4.6 The equivalence obligation

Decomposition is a refactor and must be provably behavior-preserving: the generated engine produces byte-identical output to the current engine for identical input. Establish that by regenerating from the current inline content **first**, asserting byte-identity with the committed `mitosis.js`, and only then moving modules to canonical sources. A generator that cannot reproduce today's file has not been validated.

### 4.7 Dead code cleared in the same pass

`~/.claude/workflows/parallel-plan-execution.js` cannot execute: its top-level dynamic imports throw under the runtime, and nothing routes to it since `mitosis.js` has zero `workflow()` call sites. It is still advertised as an available skill, so it fails loudly for anyone who invokes it.

Remove it, and in the same change remove `.claude/hooks/block-inline-engine.mjs`, which exists solely to block Workflow calls matching that filename, together with its PreToolUse registration in `settings.json`. Removing one without the other leaves either a live broken entry point or a hook guarding nothing.

## 5. Part IV — Stacked PRs

### 5.1 What this replaces

The frontier-train (section 0.5): local checkpoint refs stacked in dependency order, built on top, capped at 8, returning Built and refusing to ship. It is a workaround for a PR that cannot be opened until its parent merges. Stacked PRs open the PR immediately with its parent's branch as base, which removes the reason the workaround exists.

### 5.2 The convention, not the preview product

Two paths exist. The **convention** — PR B's base is PR A's head, via plain `--base` — has been generally available for years. The **preview product** (`gh stack`, public preview since 2026-07-30) adds server-side cascade management.

**This SPEC adopts the convention.** Four reasons, three of them measured:

- 0265 already chose merge-commit for dependent chains, which removes the SHA-rewrite failure class that the preview product's server-side cascading rebase exists to paper over. Adopting the product would be paying for a fix to a problem already removed at the root.
- The preview product requires the async merge API — the legacy merge endpoints cannot merge a stack — which drags `.claude/lib/superpowers-parallel/gh-merge-shim.mjs` (357 lines) into scope for no gain.
- Measured repo state 2026-08-06: `gh` 2.97.0 with **no** extensions installed, so `gh-stack` is absent and would be a new dependency on a seven-day-old preview that is documented as subject to change.
- The product's own troubleshooting documentation concedes that server-triggered rebases produce **unsigned** commits.

The standing argument that small teams gain little from stacking is about unblocking parallel *human* reviewers, which a solo owner does not have. The motive here is different — keeping the engine producing while a PR waits on a human merge — and that objection does not touch it. Recorded so a future session does not mistake it for a reason to abandon Part IV.

### 5.3 Merge method

Per 0265: **merge-commit for dependent MSP chains, squash retained for standalone PRs.**

Squash-merge replaces N commits with one new commit whose SHA matches nothing on the child branch, leaving a stale merge-base so a plain rebase replays merged content as phantom conflicts. This is structural to Git. A merge commit keeps the parent's commits reachable from the base, so the child's merge-base stays valid and no restack is needed.

This carries an obligation: **the engine must reduce each MSP branch to exactly one well-formed commit before merge**, so that a merge commit per MSP still yields clean published history. Without that, merge-commit trades a rebase problem for a history problem.

### 5.4 What gets deleted

Stacked PRs must **delete** the three pieces of compensation machinery named in section 0.5, not coexist with them: divergence detection, the supersede path, and the part of the transitive re-park cascade that exists for unmergeable parents.

Deletion is the acceptance signal. If Part IV lands and that machinery is still present, the blocking-PR architecture was extended rather than replaced, and the work did not achieve its purpose.

### 5.5 Base retargeting needs a centralized verb

`deleteBranchOnMerge` is false on this repository, and GitHub's documented auto-retarget fires on branch **deletion**, so as configured today it will not fire. The engine must retarget each child PR to the base branch explicitly once its parent merges.

Two facts make this a design item rather than a detail:

- `.claude/lib/git/pr.mjs:30` defines exactly three verbs — `pr-create`, `pr-close`, `compare`. **There is no retarget verb.**
- `gh pr edit --base` **passes the bash gate today**, which matches `pr edit` only alongside `--title`, `--body` or `--body-file` (`.claude/hooks/block-destructive-bash.sh:134`).

So the ad-hoc path is open, and taking it would route a PR mutation around the centralization rule by accident rather than by decision. **Add a `pr-retarget` verb to `pr.mjs` and deny the ad-hoc form at the gate in the same change.** Retargeting changes only the base, never the title or body, so it does not touch the rule that a PR's title and body are fixed at creation.

### 5.6 Rule amendment

`.claude/rules/common/git/branching.md:5` states squash-on-merge as the integration default without qualification. Per 0265 it is amended to scope squash-on-merge to non-chained PRs. The amendment lands with Part IV, not before it — the rule should not describe an architecture that does not yet exist.

### 5.7 CI cost

CI re-runs per stack level, which is a real cost increase that the instrument will see and that no hypothesis in Part II offsets. GitHub exposes stack position and size so expensive jobs can be gated by level. Treat this as a known cost of Part IV, measured and reported rather than assumed negligible.

## 6. Sequencing

1. **Instrument** (Part I) — lands alone, produces the baseline, including the H5 latency split.
2. **Hypotheses** (Part II) — each tested against the baseline, each independently revertible. H3 begins with a measurement, not a change.
3. **Codegen** (Part III) — begins with the byte-identity proof of section 4.6.
4. **Stacked PRs** (Part IV) — proceeds only if H5 survives, or on the architecture grounds of section 5.4 with the latency claim explicitly withdrawn.

**Implementation order is not authoring order.** Per 0271: SPEC A must **land** before any SPEC B unit begins, because SPEC B's units write into `.claude/lib`, `.claude/workflows` and `.claude/hooks`, all of which are live-linked today — rebuilding the engine under the current linkage hot-swaps the engine and its guard hooks underneath the session doing the rebuilding.

## 7. Out of scope

- **The fix pipeline**, excluded by the user from both SPECs; it may be brainstormed later as its own thread.
- Everything in SPEC A: config staging/live promotion, the release layout, the promote verb, `settings.json` ownership.
- Moving the engine off the Workflow runtime, which would forfeit `agent()` — the only effector available — and is not viable without designing a replacement effector.
- Changing the human merge gate itself. Part IV removes the *waiting*, not the gate.

## 8. Residuals, risks, and what this SPEC does not settle

- **The instrument's own source is not settled.** Section 2.2 names two candidates; `budget`'s presence in the real runtime is documented by the tool contract but was not covered by the 2026-08-06 probe, and whether transcript records carry input-token usage is unverified. Both must be measured before the instrument's shape is fixed. This is the single largest open question in the SPEC, and it sits under Part I by design: everything else waits on it.
- **A baseline of one run is a sample of one.** Engine cost varies with repository state, MSP count and CI behavior. Every hypothesis compares two samples that may differ for reasons unrelated to the change. Record variance; do not report a single-run delta as a result.
- **Fusion hypotheses can be right about cost and wrong about quality.** The instrument counts tokens and time; it does not measure whether a fused Decompose produces worse cuts. A token win with a quality regression will look like a success. Quality remains a human judgment on the output, and H1 and H2 should not be accepted on token evidence alone.
- **`runUnit` may not be safely decomposable at all.** It carries most dispatch sites and most prompt text with no twin anywhere. Section 4.3 gives a splitting rule, not an assurance that a split is safe. If the byte-identity proof cannot be maintained across a `runUnit` split, leave it whole — a 700-line function is a smaller problem than a silently divergent engine.
- **Part IV increases CI cost** (section 5.7) while Part II reduces token cost. These are different budgets and do not net out. Report them separately.
- **The preview product may become the better path later.** The choice in section 5.2 is correct for a solo repository at 2026-08-06 with `gh-stack` absent and the product seven days into preview. It is a dated judgment, not a permanent one.

## 9. Acceptance criteria

1. A run produces a durable journal carrying input tokens, output tokens, tool calls and wall-clock per dispatch site — and the journal survives the run.
2. The instrument's source is chosen on the basis of a probe result, not on the tool contract alone, and the probe result is recorded.
3. A baseline exists, with its run count and variance stated, before any Part II change merges.
4. Every cost change merged carries its hypothesis, its measurement, and its measured outcome — including changes whose outcome refuted the hypothesis and were reverted.
5. No change is accepted on dispatch-count or wall-clock evidence where total tokens rose.
6. The Ship happy-path subset is measured before any Ship collapse is proposed.
7. The generator reproduces the current committed `mitosis.js` byte-for-byte from current inline content before any module is moved to a canonical source.
8. Regeneration is deterministic, and the check fails on a stale committed artifact as well as on a drifted source.
9. Generated output contains no `Date` or `Math.random` identifier textually, and no module-level `import`/`export` statement or `import()` call form — while preserving the bare words `import` and `require` wherever they occur inside prompt strings and config keys.
10. `parallel-plan-execution.js`, `block-inline-engine.mjs` and its `settings.json` registration are removed together, in one change.
11. After Part IV, divergence detection, the supersede path, and the unmergeable-parent re-park cascade are deleted, not merely bypassed.
12. Base retargeting runs through a centralized `pr.mjs` verb, and the ad-hoc `gh pr edit --base` form is denied at the gate.
13. Each MSP branch is exactly one well-formed commit before merge.
14. `branching.md` scopes squash-on-merge to non-chained PRs, amended in the change that introduces stacking.
