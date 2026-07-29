# 2026-07-29 — Foundational architecture audit + external research of the mitosis engine

## What the user asked for

Explore the mitosis ARCHITECTURE before touching code. A ground-up rebuild is explicitly acceptable; findings were NOT to be constrained to fit the current structure. Sequence directed: audit subagents first ("no gaps"), then a researcher to judge whether the architecture is CORRECT.

Four stated complaints:
(a) Slow — 10hr+ and millions of tokens for a completion or a partial/failed exit, attributed to architectural fragility.
(b) Runs are treated as IDed restartable instances; this is messy and a FRESH workflow gets dispatched anyway. User wants ACTUAL workflow progress preserved and handed to a fresh mitosis workflow after a crash.
(c) docs/superpowers/specs/2026-07-29-mitosis-run-readiness-repair.md documents further critical run-readiness issues from a field run.
(d) Single pipeline for every development pathway. Bug fix, feature, prototype-hardening each need a different pipeline (e.g. bug fix must FIRST reproduce the issue, then diagnose, plan, implement, verify, ship).

One hard requirement: the TWO-LAYER FAN-OUT must survive any rebuild.
Priority order to resolve every trade-off: (1) robustness/quality, (2) optimization incl. tokens/context/cost, (3) wall-clock speed.

## What was dispatched

Five agents, partitioned to avoid overlap, plus one researcher. All on fable. All read-only; nothing was edited this session.
- Domain 1 codebase-analyst: two-layer parallelization architecture. Wound down at 72% context with 5 named gaps.
- Domain 2 codebase-analyst: durability, crash recovery, resumability. Read mitosis.js in full.
- Domain 3 codebase-analyst: cost and latency accounting. Found REAL run telemetry in the ledger archive.
- Domain 4 codebase-analyst: pipeline rigidity and the fragility surface.
- Gap-close codebase-analyst: the 5 gaps domain 1 left, priority on why streaming dispatch is disabled.
- researcher: is the architecture correct; 6 questions incl. a mandatory disconfirming pass.

Each was told the specs are CLAIMS TO VERIFY, not ground truth; where spec and code disagree the code wins and they must say so; and to flag unresolved gaps rather than fill them with plausible guesses.

## Corrections made during the session (do not reintroduce the errors)

1. I initially described CLUSTERS as the outer parallelization unit. WRONG. deriveClusters runs (mitosis.js:3883), is logged and persisted to the manifest, but is NEVER passed to the scheduler. No parallel()/pipeline() call iterates clusters. The runtime arbiter is a flat lease-arbitrated TICK scheduler over all MSPs: runSchedule at mitosis.js:4814. Cluster concurrency is emergent, not mechanistic.
2. I initially framed STREAMING_DISPATCH_ENABLED=false as an unexploited quick win disabled for no recorded reason. WRONG on both counts — see the gap-close section.
3. The 16-concurrent/1000-total cap is purely a harness property. No repo code enforces it. The engine's own width limits (file-scope leases, AIMD build-ahead window) bind first in practice. Domain 1's "binding constraint is the harness cap" holds only for a genuinely wide dependency-light spec.
4. There is NO receipts:gates skill in this repo. That reference resolves to an external CI enforcer action only.

## DOMAIN 1 — the two-layer fan-out as BUILT

Outer layer: flat, lease-arbitrated TICK scheduler over all MSPs (runSchedule, mitosis.js:4814-4823). Units are {id, prereqs: dependsOn, fileScope}. Leases protect declared fileScope path/glob sets — write-intent arbitration at path or glob-prefix granularity (leases.mjs:41-47). Contention DEFERS a unit to a later tick; it never queues explicitly and never parks from contention (planTick, leases.mjs:119-134). planTick recomputes leases from an empty map every tick, so a deferred unit stays `planned` and is re-evaluated fresh under criticalPathOrder.

Inner layer: per MSP, a task graph is Kahn-layered into waves (planWaves, wave-planner.mjs:31-60). Wave width = breadth of the current dependency frontier; NO numeric width cap in the planner. The ONLY harness parallel() call in the entire 4,851-line file is mitosis.js:1147 (the wave). Everything else is serial or Promise.allSettled.

isDispatchable (leases.mjs:49-56) requires all prereqs `done` (= merged). isBuildable (leases.mjs:58-68) is the frontier-train relaxation: prereqs may be built/awaiting/done, plus builtUnmergedCount < window.size.

Worktree isolation is FORCED inside mitosis: the parallelize prompt hardcodes isolation:'worktree' (mitosis.js:4418) and authoritativeConstants overwrites any drift; the log says isolation=worktree(forced). planRoute computes a route.isolation that mitosis never obeys. scope-fence lives only on the generic lane (parallel-plan-execution.js -> run-engine.mjs). Cost per MSP with T tasks: T+2 worktrees, worst case one full dependency install for the throwaway boundary-gate worktree (mitosis.js:1208).

Serialization classified INCIDENTAL (a rebuild may discard): the full-tick join (leases.mjs:176-187), the full-wave barrier (mitosis.js:1143-1198), the 6-cycle x 300s merge poll bound (mitosis.js:4707), the journal-append promise chain (mitosis.js:3972 — incidental only because the store is an append-only file).
Classified ESSENTIAL: merging into one ref, the per-MSP boundary gate, dependsOn ordering, lease overlap in SOME form, CI on the fresh combined base, the human merge gate (by policy, not algorithm).

run-engine.mjs verdict: LIVE, but on a different path. parallel-plan-execution.js:27-33 dynamically imports and calls it (the generic workflow lane). mitosis.js never executes it — ENGINE_PATH appears only inside the Parallelize prompt telling a subagent to READ the file to construct runArtifacts (mitosis.js:4415). It is also one of the 21 mirror-guard twins.

## DOMAIN 2 — durability and resume (complaint (b): CONFIRMED)

Run identity hashes the spec's FILE PATH, not content: computeLogicalRunId FNV-hashes `${spec}\n${baseBranch}` (recovery.mjs:4-12). Moving/renaming the spec or changing baseBranch orphans every checkpoint ref. A DIFFERENT spec at the SAME path silently inherits the old refs/mitosis/<runId>/* namespace.

.mitosis/run.json is machine-local, gitignored at genesis (mitosis.js:3901), and OVERWRITTEN by the next fresh-decompose genesis (mitosis.js:3902). A fresh clone, new worktree, or CI workspace therefore can never resume. The engine states this about itself at mitosis.js:4329. Every persist path logs-and-continues on failure: the manifest is explicitly "a hint, not the skip authority".

18 enumerated conditions in evaluateManifestReuse (mitosis.js:1502-1601) force a FRESH DECOMPOSE, plus 4 more upstream conditions that prevent relaunch recognition at all. Any one failing -> silent fresh decompose, announced only by the log line at mitosis.js:3800. The one LOUD path is the optional verb:'resume', which SKILL.md never sends.

FINEST DURABLE UNIT OF PROGRESS = a whole BUILT MSP. Task-level work survives only as local git commits that reconcile NEVER consults. On relaunch, branch -f resets the integration ref fresh onto base (mitosis.js:4511, :4540), DESTROYING the crashed run's locally integrated tip. A 40-minute implementer's work is preserved by nothing but the filesystem.

Two independent, non-composing resume systems: the harness's resumeFromRunId prefix-replay of cached agent() results (same-session only; the engine has zero references to it) and mitosis's cold reconcile. Cross-session recovery is cold-reconcile only.

Shipped units are re-adopted by BRANCH-NAME PATTERN with NO run-identity check (recovery.mjs:31-48 -> mitosis.js:4240-4246), applied on fresh runs too. This is the mechanism behind MSP-10 silent cross-run adoption. No genesis collision check exists anywhere.

Compensation is theatre. saga.mjs composes undo command STRINGS stored in park records as human-facing advisory text. No engine path executes them. The remediation loop awaits deps.compensate then DISCARDS its return value (mitosis.js:1820-1822). The actual reset is prose prepended to a retry prompt. permittedForce is dead metadata read only by its own test. UNKNOWN_PROBE_BUDGET is exported and test-asserted but never consumed by engine logic.

Spec verdicts: MSP-2 CONFIRMED, MSP-3 CONFIRMED, MSP-5 CONFIRMED (relaunch path passes no expected sha; selectResumeBuilt never carries builtSha so the loose side CANNOT be strict), MSP-6 CONFIRMED (applyBuiltTransition spread preserves stale resumePoint; rescue guard at :3706 then skips), MSP-8 CONFIRMED, MSP-10 CONFIRMED. MSP-4 PARTIAL — substantively right but the spec misdescribes one path: a push agent reporting failure while still returning a sha DOES record it; pushed:false alone does not null it. MSP-7 PARTIAL — awaiting status works, but one genuine park plus zero ships still yields `failed` because hasFault short-circuits the awaiting branch (mitosis.js:3386-3394).

## DOMAIN 3 — cost and latency (complaint (a): QUANTIFIED)

MEASURED anchor, from real run journals in .claude/ledger-archive-v1/: ~55k tokens per agent dispatch averaged. Two runs agree within 4% (3.0M/56 agents; 7.9M/141 agents). Cost therefore reduces to dispatch count x ~55k.

Measured runs, both ZERO yield:
- 2026-07-14 wf_e7379606-586: ~3.0M tokens, ~114 min, 56 agents. Rebuilt already-merged work (ambient-gh defect).
- 2026-07-20 wf_0050fbc2-ad2: ~7.9M tokens, ~3.6h, ~141 agents. Died at `branch` on a trailing-slash sourcePrefix.
- Execute-stage halt re-spends ~4.7M (re-pays ~100% of build compute).
- A 16-MSP run shipped 2 of 16 BY DESIGN, because the human gate never merges in-run.

Dispatch formula: 4 + N*(8 + 2T + sT + W) + merge-poll. Worked example N=6, T=4, W=2, s=0.5, A=6: ~124 clean dispatches -> est. 6.8-10.8M tokens. Worst case with budgets exhausted: 250-330 dispatches -> est. 13-18M tokens. One bad task can consume ~44 dispatches. Merge poll alone at full quiescence: 6 cycles x 6 units x 2 = 72 dispatches that mostly return "not merged".

Estimated wall-clock split of a long run (NOT instrumented anywhere; the quiescent spec's M5 instrumentation exists because it was never measured): 30-45% compute, 10-15% in-agent polling, 45-60% human merge latency + relaunch re-payment.

Waste ranked: (1) relaunch rebuild tax — buys nothing; (2) prose-as-syscall micro-agents, 10-14 dispatches per MSP running deterministic git/append ops, est. 1-2M tokens per 6-MSP run — buys nothing; (3) return-channel pagination + literal-inline engineArgs, one 20KB task fullText paid 4-6x; (4) opus pinned on mechanical stages — `branch` is a git fetch + branch -f (mitosis.js:4516, :4543), `integrate` is --no-ff merges; (5) review multiplicity + polarity-blind self-escalation; (6) merge-poll agent pairs; (7) tick+wave barriers idling fast units; (8) dead payloads — finalReviewer.md is resolved into engineArgs.prompts and NEVER dispatched, and the fence path is unreachable since isolation is forced.

DESTRUCTIVE_OP_RE (run-engine.mjs:100) matches force-push and --force-with-lease in task.fullText with NO polarity awareness, feeding both securityReviewRequired and policyModelFor. A task whose text says "NEVER force-push" is escalated to opus PLUS a mandatory two-lens security review with its own fix loop.

Largest single driver: per-dispatch fixed cost (~55k) x a dispatch count inflated ~2-3x over irreducible work, re-paid in full on every relaunch.

## DOMAIN 4 — pipeline rigidity and fragility

HIGHEST-VALUE FINDING: the no-imports / cannot-execute constraint is SELF-IMPOSED, not a harness limit.
- The script body is evaluated as an ASYNC FUNCTION BODY — the test harness reconstructs it exactly: new AsyncFunction('args','agent','parallel','log','phase','workflow', mitosisBody) at tests/frontier-train-e2e.test.mjs:15-17. Inside a function body, STATIC import is a SyntaxError. That part of the constraint is REAL.
- But dynamic await import() is legal there, and the sibling Workflow script uses it IN PRODUCTION: parallel-plan-execution.js:27-28 loads node:os and run-engine.mjs by file:// URL, same directory, same Workflow tool, and it is the blessed engine path (a hook exists solely to route its invocation, .claude/hooks/block-inline-engine.mjs:14-19).
- Therefore await import('node:child_process') would resolve identically. "The engine cannot execute anything" is POLICY the codebase adopted, not a harness limit.
- Corroborating: the harness injects a workflow() callable that mitosis.js NEVER uses. It inlined runEngine instead of sub-dispatching, and that is what created the 21-module twin set.
- CAVEAT, still unverified: nobody has confirmed child_process actually EXECUTES at runtime rather than merely resolving. This is the one fact that could rehabilitate the prose layer as forced rather than chosen. It is a ~30-second test and it is the first thing to settle next session.

The 13 phases are imperative CONTROL FLOW, not data. meta.phases (mitosis.js:4-19) is decorative. Phases share state by LEXICAL CLOSURE: mspById, resumeMap, shipped/parked/awaitingApproval arrays, blockedByPark/blockedByApproval sets, builtInRun, compensationStack, retryState, and the mergeQueue promise chain are all free variables captured across stage boundaries. No phase can be lifted, reordered, or skipped without first inventing an inter-phase state contract that does not exist. Resume stages come from a hardcoded 6-item vocabulary LEGAL_STAGES (mitosis.js:2160); sanitizeStage silently nulls anything outside it.

No reproduce phase and no channel for repro evidence anywhere: not in DECOMPOSE_SCHEMA (mitosis.js:1260-1284), not in buildInitialManifest, not in planGroundTruthSeed, not in the task contract, not in the PR verification fields. The only place reproduction context could ride today is unstructured prose in fullText. planIncomplete checks that a plan MENTIONS a red step, never that red was OBSERVED. The red-green receipt is an external CI action read only as a terminal conclusion string post-PR.

An N=1 bug fix pays the ENTIRE 13-phase machine — receipts prerequisite probe, up to 3 adversarial plan-review iterations, a Parallelize round-trip of a tens-of-KB engineArgs object, worktree fan-out for one task, checkpoint push, CI watch — for ZERO fan-out benefit. retryState.max degenerates to 4.

A PROMPT THAT LIES: the reconcile prompt tells the agent the engine "will FAIL the run if the chunks do not rejoin into parseable JSON" (mitosis.js:3641). The code instead yields priorManifest=null (mitosis.js:3674-3677) and proceeds as a FRESH run — a silent re-plan of everything. Code wins; the prompt lies. Separately, mergePaginated silently DROPS malformed pages (mitosis.js:2665-2673), silently shrinking builtUnits -> silent rebuild of already-built work.

FOUR divergent states, not three: HEAD 450804e (feat/centralized-pr-creation, PLUS uncommitted mitosis.js edits), local main cd5c65d, local origin/main ref d77346d, actual remote main 6d19499. ~/.claude/{workflows,lib,skills,settings.json,CLAUDE.md,agents,docs,...} are symlinks into this repo's .claude/, and ~/.claude/hooks/* and ~/.claude/rules/* are per-entry symlinks. THE CHECKED-OUT BRANCH IS THE RUNNING ENGINE, and it is currently a DIRTY FEATURE BRANCH.

The engine composes commands this environment's OWN gates hold: git reset --hard + git clean -fdx in the Tier-0 retry preamble (mitosis.js:126-134) and perAttemptCompensation (:2431-2439); git branch -D in saga undo (:2372). All are ask-class in .claude/hooks/block-destructive-bash.sh:65-80. An ask raised inside an unattended subagent is a stall.

Halts that fail the repair spec's own success bar: the receipts-artifact halt fires while the engine STILL CONTAINS the bootstrap machinery that computes the exact file bytes (decidePrepareActions :3477-3491, buildPrepareWriteSections :3525-3550) and then converts anyWrite into a halt. A malformed MSP title kills the whole run PRE-fan-out (:3848-3850) rather than re-asking the decomposer to fix one field, despite the engine holding a remediation loop. A single reconcile or prepare agent dropping is a WHOLE-RUN SPOF (:3655-3661, :3934-3937).

Blocked vs died vs returned-nothing are INDISTINGUISHABLE: a blocked dispatch returns null and runStage maps null to Unknown{raw:null} — same bucket as a dead agent or garbage. Unsupervised paths then diverge: checkpoint-push null logs-and-continues with builtSha=null; ship null halts with an honest confession; divergence probe null fails closed.

Repair tax is triple: 21 byte-identical twins (tests/mirror-guard.test.mjs:19), tests pinning literal prompt PROSE (frontier-train-e2e.test.mjs:501, :319-325; mitosis-scheduler.test.mjs:415, :704-705, :742-743; no-self-merge-consent.test.mjs:70-72; plus prepare-probe-template-scope, gh-scope-lint, dead-export-lint), and protect-claude-config.sh raising ask on every Edit/Write under .claude/{hooks,rules,lib,workflows} by path AND realpath. Unattended fan-out ON the engine is impossible by construction.

Repair spec section 7's two retired claims appear nowhere else in code, tests, or docs. Code confirms both corrections.

## GAP-CLOSE — why streaming dispatch is disabled, and the REAL bottleneck

VERDICT: deliberately never flipped, by recorded decision. Neither unfinished nor unsafe nor untested.
- Born disabled in commit 27a9143 (2026-07-15) WITH the test pinning it false in the same commit (leases.test.mjs:557-559, wording: "until the flip is proven"). git log -S shows no commit ever set it true.
- THE LOAD-BEARING JUDGMENT: .claude/ledger-archive-v1/decisions/2026-07-16-mitosis-frontier-train-architecture.md:6 states verbatim "Flipping STREAMING_DISPATCH_ENABLED does NOT fix it (shared readiness rule)." The 2026-07-15 throughput decision identified Issue 9 as DOMINANT: dependents gate on prereq state `done` (= merged), so per-run throughput = |root antichain| under human-gated merges. Both schedulers share isDispatchable. The tick barrier (Issue 12) was SECONDARY. The chosen remedy for the dominant cause was the two-frontier build-ahead model, which works under both schedulers and IS the enabled default.
- Formally deferred behind a gate at docs/superpowers/specs/2026-07-17-mitosis-optimization-design.md:204 requiring a runtime enable path AND a validation A/B AND a dated flip-or-delete follow-up. The A/B was never run. That spec's guardrail G7 names the long-lived const-false flag pattern a recurring mistake class.
- The flip-or-delete resolved to DELETE: 2026-07-28-mitosis-quiescent-advance.md:65,79,225,276 classifies runScheduleStreaming as a flag-disabled duplicate and deletes it as part of collapsing three advance loops into one — redundancy, not a correctness hazard.
- Coverage: 7 tests exercise the streaming path via {streaming:true}; the suite ran 36/36 green on 2026-07-29.

Scheduler model confirmed against tests, with two nuances:
- Nuance 1: the tick-join penalty is NARROWER than assumed. An `awaiting` (PR-open) parent does NOT block dependents — they build ahead in the same run (leases.test.mjs:189-214, :396-403). The join penalty is intra-tick wall-clock only, not across the merge gate.
- Nuance 2: the in-run merge poll is a bounded scheduler continuation whose budget is CONSECUTIVE FRUITLESS polls, reset on progress.

AIMD window: shape and floor have recorded, cited rationale (2026-07-16-mitosis-frontier-train-design.md:106-110, 149-153 — Zuul ships floor 3 / +1 / halve for the same problem class; cost-asymmetry argument under the pillar order). The literal ceiling 8 landed in commit 44f9a62 with NO derivation, was re-confirmed by ledger decision 0086 on "not a new number" grounds, and the AIMD SIGNAL was found incoherent: a persistent APPROVED was re-counted every poll with no dedup, inflating 3->8 off ONE approval.

maxSteps: intent recorded (re-anchor on progress so the bound never binds). The exact formula units.length*(maxPollCycles+2)+1 and the tick/streaming +1/+2 asymmetry have NO recorded rationale anywhere; no test pins the bound. 2026-07-28-mitosis-quiescent-advance.md:18 classifies the mechanism as a live defect and deletes it.

16-concurrent/1000-total: purely a harness property the engine documents. No repo code enforces it; the only literal hits are FNV constants, MAX_RATIONALE_LEN, hex radix, and the 16-char PR scope grammar.

## RESEARCH VERDICT — rebuild the core, preserve the fan-out as semantics

Confidence: HIGH for the effector boundary and durability model (4 independent primary sources agree on the pattern, and the audit's measured cost/failure data agree with it); MEDIUM-HIGH for pipeline-as-data.

Three errors IN KIND, not degree, all solved years ago by the durable-execution industry:
1. Routes deterministic side effects through a language model, inverting the orchestrator/activity boundary that Temporal, Azure Durable Functions, DBOS, and Restate all draw identically. Temporal's guidance explicitly lists LLM/AI invocations as one KIND of activity to quarantine — never the transport other activities travel through. Anthropic's own agent guidance draws the line at open-endedness: agents for problems where you cannot hardcode a fixed path; a git push is the definition of a hardcodable path. Anthropic's code-execution-with-mcp post reports 150,000 -> 2,000 tokens (98.7% reduction) for moving transcription into executed code — mitosis's chunked JSON transcription is precisely that anti-pattern.
2. Durability at the wrong granularity (whole MSP), in the wrong place (machine-local, overwritten), under the wrong key (path, not content). The industry unit is the individual STEP output in a store any fresh worker can read. Git itself is the canonical content-addressed store and mitosis sits on top of it while keying by path.
3. Pipeline as closure-coupled imperative control flow, when mature systems express workflow shape as DATA over one shared runtime (Step Functions' Amazon States Language; Temporal workers registering many workflow types).

THE FINDING THE USER MOST NEEDS: per-run throughput is bounded by root-antichain width x human review latency, and NO fan-out redesign can fix it. The two-layer fan-out is safety-and-isolation machinery, not a throughput machine. The only architectural lever is making WAITING FREE — a durable-execution engine parks on a human signal at zero compute and resumes exactly where it stopped, whereas mitosis dies after ~30 min of polling, reports failed, and re-pays decompose-and-rebuild on relaunch. Optimizing scheduler cleverness while each wait costs a relaunch is optimizing the non-bottleneck.

Prior-art corrections to the design's own reasoning:
- ZUUL IS THE WRONG PRIOR ART for build-ahead. Zuul and GitHub's merge queue speculate over changes ALREADY APPROVED AND ENQUEUED; the only remaining uncertainty is CI. Mitosis speculates over units a human may reject or rewrite. The correct lineage is STACKED DIFFS (Gerrit/Phabricator/Graphite/Sapling) — and mitosis adopted the speculation WITHOUT the restack half, so a changes-requested parent has no automated path to propagate into its already-built dependents. Unmanaged rework by construction. Zuul's window SHAPE does match; its signal POPULATION does not.
- AIMD IS MISAPPLIED: the control law is fine, the plant is wrong. "Changes requested" means this content is wrong, not you are speculating too deep. Halving does not make the next review likelier to pass; widening on approvals does not mean review capacity grew. Replace with bounded, SUBTREE-LOCAL depth control — a causal response.
- LEASES SHOULD BE DEMOTED, not deleted: from safety mechanism to speculation-PRUNING heuristic, the role Uber SubmitQueue's conflict analyzer plays. The actual safety net is merge-time detection (what a merge queue is) plus worktree isolation (Bazel's argument, already right). LLM-guessed globs are the weakest of four conflict predicates and the only GUESSED one; observed write-sets are free after the fact.
- A second SAME-MODEL reviewer buys less than it costs: LLM judges favor similar models, and model errors converge as capability rises (correlated failures). Deterministic verification is uncorrelated with the implementer and cheaper.
- Multi-agent costs ~15x chat tokens and is justified only for genuinely parallelizable high-value work; Anthropic notes most CODING tasks have fewer truly parallelizable subtasks than research. Cognition's independent counter-position reaches the same warning from failure analysis. MAST taxonomizes 14 failure modes over 1600+ traces, with task VERIFICATION as one of three clusters — where mitosis's self-report trust model and Unknown-conflation sit.

DISCONFIRMING PASS RESULTS (the audit's conclusions survived):
- "LLM effectors buy adaptability" — PARTIALLY SURVIVES, RELOCATED. Real, but prior art places adaptability at the EXCEPTION path, not the transport. Deterministic executor on the happy path + LLM diagnostician on failure keeps ~100% of adaptability for ~5-10% of dispatches. No prior art found where prose-mediated effectors outperformed deterministic ones. Both zero-yield runs were CAUSED by the prose layer — the adaptability layer caused the failures it exists to absorb.
- "Fail-closed halting is correct" — SURVIVES. Keep the policy; fix the durability so halting does not forfeit everything.
- "The human merge gate is irreducible governance" — SURVIVES, and must not be softened. See the bottleneck finding above.
- "Twinning buys a testable core" — FAILS. It exists only because of the self-imposed no-import policy that the sibling script disproves in production.
- "Wave barrier as simplicity" — MOSTLY MOOT given the shared readiness rule.

TWO THINGS THE CURRENT ENGINE GOT RIGHT — a careless rebuild would REGRESS these:
1. Fail-closed halting.
2. The built | awaiting | done speculation states. The frontier-train work correctly identified the real bottleneck and attacked the only attackable part. Reverting to strict merge-gated readiness would be WORSE THAN TODAY.

THE BOUNDARY THAT SHOULD HAVE BEEN DRAWN: deterministic code executes everything whose next step is knowable in advance; the LLM is consulted only where judgment is genuinely required — and every LLM consultation is itself a journaled, idempotent step. Four layers: strict-deterministic orchestrator (pipeline-as-data interpreter, no I/O, no clock, no randomness); deterministic activities (every git/gh/file/CI-poll op as subprocess calls with idempotency keys and journaled results); LLM activities (decompose, plan, implement, review, and DIAGNOSE failures the deterministic layer could not classify); human gate (an external signal the engine sleeps on for free). Mitosis's error in these terms: built layer 1 without durability, deleted layer 2 entirely, and made layer 3 impersonate layer 2 at ~55k tokens per impersonation.

KEEP: two-layer fan-out semantics; speculative build-ahead with built|awaiting|done (re-grounded in stacked diffs, plus the missing mechanical restack); fail-closed halting; worktree isolation per unit; leases DEMOTED to a pruning heuristic reconciled against observed write-sets; per-MSP PRs, the green-branch invariant, and the PR honesty rules; and all the prompt/skill IP inside agent dispatches — only its TRANSPORT changes.

SOLVED PROBLEMS BEING RE-SOLVED BADLY: crash survival (step-level journaling + replay/checkpoint); waiting on a slow external party for free (durable workflows park on signals at zero compute); not doing a side effect twice (idempotency keys); state portable across machines (shared store + content-addressed identity); keeping a shared branch green under parallel merges (merge queues with speculative grouping and eviction); building on an unreviewed parent (stacked diffs with mechanical restack); multiple workflow shapes in one engine (workflow-as-data + multi-type registration); cheap deterministic ops under an agent (code execution instead of model-mediated transcription).

RISKS OF A REBUILD, honestly stated: determinism is a discipline not a feature, and replay bugs are subtler than anything in the current engine; the SECOND-SYSTEM EFFECT is the real danger because the correct-feature list is long and attempting it at once reproduces this engine's original sin of ambition outrunning verification; prompt-embedded operational knowledge not captured in canonical modules can be silently lost; THE BOTTLENECK DOES NOT MOVE — after a flawless rebuild, wall-clock shipping speed barely changes, and the real wins are token cost (the 1-2M/run deterministic-op spend and the relaunch tax both -> ~zero) and crash-loss (whole-MSP -> task-level); and regression risk on the two keep-items if the rebuild team treats everything old as wrong.

## What did NOT happen this session

No code was read by the main thread beyond an initial orientation pass; no file was edited; nothing was committed or pushed; no rebuild was approved. The user explicitly deferred SPECIFIC details to a fresh session. Domain 1's agent wound down at 72% context and its 5 gaps were closed by a separate agent. Domain 3's agent noted context at 80% and flagged per-label token instrumentation as needing a fresh pass.

## Unresolved, carried forward

1. Does dynamic import of node:child_process EXECUTE inside a Workflow script, or merely resolve? Unverified; a ~30-second test; the single highest-leverage remaining fact.
2. Per-label token distribution — only run-level averages exist; never instrumented.
3. The compute/poll/human split of any real 10hr episode — no journal records it; the split above is an estimate.
4. Whether an off-the-shelf durable-execution runtime is USABLE INSIDE the Claude Code workflow harness, versus adopting only its state model.
5. Whether receiptsPass/d6Pass self-reports are cross-checked anywhere — no read-back found; only the merge claim is verified.
6. The 0099 boundary layer exists only on remote main 6d19499 and was not inspectable from this checkout.
7. Divergence-invalidation frequency and rebuild-burst cost — explicitly unmeasured.
8. Six other paused mitosis threads target REPAIRING the current engine. If a rebuild is chosen, several become moot and need explicit disposition.