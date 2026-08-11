# Mitosis Plan 3 — Mitosis Entry Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the top-level `mitosis` skill that owns the end-to-end MSP-driven flow (decompose a SPEC/batch into clusters of MSPs, order them bottom-up, plan and graph each, fan out into worktrees with risk-scaled review, serialize merges) and that fully ABSORBS the execution-routing currently living in `parallel-subagent-development`, so that skill can be deleted in Plan 5 with no capability loss.

**Architecture:** One prose skill, `skills/mitosis/SKILL.md`, plus a structural absorption-parity gate. Mitosis adds no new runtime code: it reuses the existing planner/engine libraries verbatim (`wave-planner.mjs`, `route-planner.mjs`, `generate-run-script.mjs`, `resolve-superpowers.mjs`, `workflows/parallel-plan-execution.js`) and calls the `plan-to-task-graph` skill from Plan 2. The routing logic (lane / isolation / engine-handoff / dispatch-notice / validation-resolution / kill-switch / route-planner inputs) is reproduced verbatim into the Mitosis skill so deletion of `parallel-subagent-development` in Plan 5 is a no-op for capability.

**Tech Stack:** Markdown skill prose; the reused `lib/superpowers-parallel/*.mjs` libraries and the `workflows/parallel-plan-execution.js` engine (called, not modified here); `grep`/`rg` for structural and parity verification.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git` commands, NO commit steps. Per-task verification commands are the gate. The ledger has no commit step.
- The `protect-claude-config.sh` PreToolUse hook returns "ask" on writes under `rules/`, `skills/`, and `settings` paths — EXPECTED; the human approves each write. Do not treat the prompt as an error.
- NEVER write code comments (shebang/pragma carve-outs only). NEVER use emojis. NEVER add AI co-author attribution.
- Pinned versions, no auto-update in `~/.claude` config; version bumps are human-approved.
- Three Pillars priority: Quality > Optimization > Speed; never trade a higher for a lower. (rules/common/pillars.md)
- REUSE, do not rebuild: `lib/superpowers-parallel/{wave-planner,route-planner,generate-run-script,resolve-superpowers}.mjs` and `workflows/parallel-plan-execution.js`. Mitosis calls them; it does not fork them.
- ABSORPTION IS A HARD PRECONDITION OF PLAN 5: every routing piece below must be present in `mitosis/SKILL.md` before `parallel-subagent-development` is deleted. The seven pieces are: (1) lane selection via route-planner; (2) isolation selection; (3) engine handoff; (4) dispatch-notice / no-cost-gate posture; (5) validation-command resolution; (6) kill-switch / degradation; (7) the route-planner input fields.
- The engine handoff invocation shape is load-bearing and must be reproduced verbatim: `node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs <plan>.graph.json --base-branch <b> --scoped-check '<cmd>' --full-validation '<cmd>' --isolation <worktree|scope-fence>` then `Workflow({ scriptPath: "<plan>.run.js" })` (scriptPath form, NO `args`, NO `name`).
- `~/.claude` itself is non-git: the worktree/merge-queue/enforcer topology governs the OTHER git projects Mitosis runs in; in `~/.claude` it degrades to serial apply.

---

### Task 1: Create the `mitosis` entry skill

**Files:**
- Create: `~/.claude/skills/mitosis/SKILL.md`

**Interfaces:**
- Consumes: the `plan-to-task-graph` skill (Plan 2); `route-planner.mjs`, `generate-run-script.mjs`, `wave-planner.mjs`, `resolve-superpowers.mjs`, `workflows/parallel-plan-execution.js`; `rules/common/tool-routing.md` (D1 stack, Plan 1) and `rules/common/pillars.md` (Plan 1).
- Produces: the user-facing entry skill for MSP-driven development. Its `description:` engages on "implement/execute an approved SPEC or batch as shippable units / in parallel." Referenced by `rules/common/spec-decomposition.md` (Plan 5) and the repointed drift-check hook (Plan 5).

**Context the implementer MUST read first:** the current `~/.claude/skills/parallel-subagent-development/SKILL.md` — the routing being absorbed. Read it fully; the routing prose below is reproduced from it (verbatim mechanism, generalized to the MSP layer). Also have the merge-gate forward reference in mind: Section "Merge and ship" points at receipts + D6 + the branch contract, which Plan 4 builds; the prose here describes the intent so Plan 4 wires the concrete files.

- [ ] **Step 1: Verify the skill does not exist yet (the "red" baseline)**

Run:
```bash
test -f ~/.claude/skills/mitosis/SKILL.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Confirm every reused library is present before writing a skill that calls them**

Run:
```bash
for f in wave-planner.mjs route-planner.mjs generate-run-script.mjs resolve-superpowers.mjs; do \
  test -f ~/.claude/lib/superpowers-parallel/$f && echo "OK: $f" || echo "MISSING: $f"; \
done; \
test -f ~/.claude/workflows/parallel-plan-execution.js && echo "OK: engine" || echo "MISSING: engine"; \
test -f ~/.claude/skills/plan-to-task-graph/SKILL.md && echo "OK: plan-to-task-graph" || echo "MISSING: plan-to-task-graph (build Plan 2 first)"
```
Expected: all six print `OK`. If `plan-to-task-graph` is `MISSING`, Plan 2 has not been executed — stop and execute Plan 2 first.

- [ ] **Step 3: Create `~/.claude/skills/mitosis/SKILL.md`**

Write this exact content (the PreToolUse hook will prompt "ask"; approve it):

```markdown
---
name: mitosis
description: Use when implementing or executing an APPROVED spec or batch of work as parallel, independently shippable units (engages on "implement the spec", "execute the plan as MSPs", "ship this in parallel", "decompose into shippable units"). Owns the end-to-end MSP-driven flow — decompose into clusters of MSPs, fan out across isolated worktrees with risk-scaled review, serialize merges so every shared branch stays green. Supersedes parallel-subagent-development.
---

# Mitosis

MSP-driven parallel development. An MSP (minimum shippable product) is the unit of work: the smallest change that ships independently and leaves its branch green and the app non-broken. Mitosis decomposes a SPEC or batch into clusters of MSPs, fans them out across isolated worktrees with risk-scaled review, and serializes merges so every shared branch stays green at all times.

Governance: resolve every trade-off by the Three Pillars — Quality > Optimization > Speed; never trade a higher for a lower (rules/common/pillars.md). Automate by default — there is no mandatory human gate (D2); print a dispatch notice and proceed unless the user explicitly says otherwise. The user can interrupt.

## The flow (end to end)

1. Decompose the SPEC/batch into clusters of MSPs (see "Decomposition").
2. Order MSPs bottom-up in dependency order for stacked shipping.
3. Per MSP: write a plan (superpowers:writing-plans) -> harden it into a task graph (the plan-to-task-graph skill) -> lay out waves (wave-planner.mjs).
4. Route and fan out each MSP's waves (see "Execution routing").
5. Merge serially into the integration branch through the receipts CI enforcer + the composed D6 check (see "Merge and ship").
6. Ship: one auto-opened PR per MSP, stacked bottom-up; one squash per MSP at the published boundary.

## Decomposition (D1 code-intelligence stack)

Use the three layers per rules/common/tool-routing.md:
- Native LSP call hierarchy = the dependency ORACLE. The source of truth for semantic dependency edges between candidate MSPs. Corroborate the seams it cannot see (dynamic dispatch, DI, FFI, SQL, codegen) with targeted reads.
- Graphify = the orientation MAP + reliable file/import/inheritance layer. Use it to orient: where does X live, what clusters with it.
- Serena = edit-only.

Cluster work into MSPs so each is independently shippable and leaves its branch green. Order MSPs bottom-up so a dependent MSP stacks on the branch of the MSP it needs.

## Per-MSP planning

For each MSP, in bottom-up order:
1. superpowers:writing-plans -> an approved plan markdown.
2. Invoke the plan-to-task-graph skill -> a hardened `<plan>.graph.json` (declared intent + machine-derived monotonic dependency safety net + audit log; halts only on an implied cycle).
3. Preview waves: `node ~/.claude/lib/superpowers-parallel/wave-planner.mjs <plan>.graph.json`.

## Execution routing

Routing is a derived rule, not a feel call. Compute it; do not override it by intuition.

1. Lane selection. Run:
   `node ~/.claude/lib/superpowers-parallel/route-planner.mjs '<inputs as one JSON object>'`
   It returns `{ rule, lane, isolation, handoff, N, notes }`. `lane` is `inline` (single task), `light` (manual prompt-fenced subagents), `workflow` (the heavy engine), or `none` (recommend handoff instead). Treat the result as binding.
2. route-planner inputs (the JSON object): `T` (task count), `W` (wave count from wave-planner), `D` (`long` if any task is TDD/multi-file/scoped-check; `short` only if all single-file mechanical; uncertain -> `long`), `S` (context used-pct from the newest `~/.claude/run/context-sentinel-*.json` within 30 min, else 0), `GIT` (`git rev-parse --is-inside-work-tree` succeeds), `WF` (Workflow tool resolves; default true), `cleanTree` (`git status --porcelain` empty), `exploratory` (only if the user declared it), `consentRecorded`, `wallClockOver30m`, `topTierSession`.
3. Isolation selection. The planner returns `isolation`: `worktree` when multi-wave or dirty tree; `scope-fence` when single-wave and clean tree; `null` for inline/light lanes. Worktrees branch off the MSP's feature branch (local state, never the remote default).
4. Engine handoff (heavy/workflow lane only), two steps:
   a. Generate the self-contained run script:
      `node ~/.claude/lib/superpowers-parallel/generate-run-script.mjs <plan>.graph.json --base-branch <feature-branch> --scoped-check '<cmd>' --full-validation '<cmd>' --isolation <worktree|scope-fence>`
      (optional `--models '{"reviewer":"sonnet","fixer":"sonnet"}'`). Output: `<plan>.run.js`.
   b. Invoke the engine: `Workflow({ scriptPath: "<plan>.run.js" })`. scriptPath form only — NO `args`, NO `name`.
5. Dispatch notice (no cost gate). Print exactly one line, then dispatch: lane + isolation, wave layout (W waves / T tasks, max width), expected agents N, token estimate (~46k x N), model tiers (reviewers/fixers on sonnet; implementers/boundary/final on the session model), and any priced exception from notes. The notice is informational; do not wait for approval — the user can interrupt.
6. Validation-command resolution (both lanes), in priority order: (a) the project's `/verify-<project>` command — scoped invocation -> `--scoped-check`, full invocation -> `--full-validation`; (b) composed from package.json scripts — typecheck + per-file lint + scoped tests (scoped), build + full suite (full); (c) ask the user, and suggest the verify-setup skill once if `/verify-<project>` is absent. Node 26+: never pass a bare directory to the node test runner; use the glob form `"tests/**/*.test.mjs"`. Type-unclean repos: gate on novel `error TS` lines via a baseline diff (fresh-worktree baseline for per-task gates; main-tree baseline for boundary).
7. Kill-switch / degradation. The `disableWorkflows` setting (or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) disables the Workflow tool; routing then degrades to rule 1 (manual light lane). Light-lane agents stay prompt-fenced regardless.

## Merge and ship

Every merge leaves the shared branch green and the app non-broken — for multiple worktrees off one feature branch AND for the solo single-developer case.

- Serialize merges into the integration branch. Gate each at the receipts CI enforcer (the tracker-agnostic red->green receipt) plus the composed D6 cluster-boundary interaction check (rules and templates: receipts.config.json + .github/workflows/receipts.yml). The enforcer's G8 covers the fresh-base check and G9 the full-scope suite.
- Branch contract — declare-or-pass-or-ASK, NEVER default. For BOTH source/head AND base/target: explicit pass -> declared machine-readable config -> STOP AND ASK. NEVER derive the base from the platform default branch; NEVER assume the source. Defaulting a PR onto main/master is a forbidden, CRITICAL failure.
- One auto-opened PR per MSP, stacked bottom-up. One squash per MSP at the MSP->integration published boundary: published history gets one squashed commit per MSP; atomic commits stay on the feature branch. If Conventional Commits / semantic-release is in play, the squash message (PR title) must be CC-formatted (PR-title lint).
- Branching is detected-then-confirmed per project; degrade to atomic commits, or `git init`, when there is no repo.

## Environment note

In `~/.claude` itself (non-git): no worktrees, merge queue, or enforcer — these degrade to serial, human-approved apply (no commit step; per-task verification commands are the gate). Receipts hooks/skill/MCP still install globally and stand down with zero spurious blocks.
```

- [ ] **Step 4: Verify the skill exists and carries the flow + governance anchors**

Run:
```bash
grep -n "^name: mitosis" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "Three Pillars" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "## The flow (end to end)" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "## Decomposition (D1 code-intelligence stack)" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "Supersedes parallel-subagent-development" ~/.claude/skills/mitosis/SKILL.md
```
Expected: all five lines print.

- [ ] **Step 5: Verify the skill calls the reused libs and plan-to-task-graph (does not re-implement)**

Run:
```bash
grep -n "route-planner.mjs" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "generate-run-script.mjs" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "wave-planner.mjs" ~/.claude/skills/mitosis/SKILL.md && \
grep -n "plan-to-task-graph" ~/.claude/skills/mitosis/SKILL.md && \
grep -n 'Workflow({ scriptPath:' ~/.claude/skills/mitosis/SKILL.md
```
Expected: all five lines print.

- [ ] **Step 6: Verify style invariants (no emoji)**

Run:
```bash
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/skills/mitosis/SKILL.md ; echo "emoji-exit=$?"
```
Expected: `emoji-exit=1` (no matches).

No commit step — `~/.claude` is non-git.

---

### Task 2: Absorption-parity gate — prove every routing piece is present before Plan 5 can delete the source

**Files:**
- Read-only verification against `~/.claude/skills/mitosis/SKILL.md` and `~/.claude/skills/parallel-subagent-development/SKILL.md`. No file is written.

**Interfaces:**
- Consumes: the `mitosis/SKILL.md` from Task 1.
- Produces: a PASS/FAIL gate. PASS is the hard precondition that licenses Plan 5 Task 1 (deletion of `parallel-subagent-development`). FAIL means a routing capability would be lost on deletion — fix `mitosis/SKILL.md` and re-run.

**Context:** the seven routing pieces (Global Constraints). Each must appear in the Mitosis skill with its concrete mechanism, not just a mention.

- [ ] **Step 1: Verify each of the seven routing anchors is present in `mitosis/SKILL.md`**

Run:
```bash
M=~/.claude/skills/mitosis/SKILL.md; pass=1; \
check() { grep -q "$2" "$M" && echo "OK: $1" || { echo "MISSING: $1"; pass=0; }; }; \
check "1 lane selection (route-planner)" "route-planner.mjs '<inputs"; \
check "2 route-planner inputs (T/W/D/S...)" "context-sentinel-"; \
check "3 isolation selection" "scope-fence when single-wave"; \
check "4 engine handoff (generate + Workflow)" 'Workflow({ scriptPath:'; \
check "5 dispatch notice / no cost gate" "do not wait for approval"; \
check "6 validation resolution" "/verify-<project>"; \
check "7 kill-switch / degradation" "disableWorkflows"; \
echo "PARITY=$pass"
```
Expected: seven `OK:` lines and `PARITY=1`. Any `MISSING` -> add the missing mechanism to `mitosis/SKILL.md` Task 1 Step 3 content and re-run until `PARITY=1`.

- [ ] **Step 2: Cross-check against the source skill — no routing concept is left only in the skill being deleted**

Run:
```bash
P=~/.claude/skills/parallel-subagent-development/SKILL.md; M=~/.claude/skills/mitosis/SKILL.md; \
for tok in "route-planner.mjs" "generate-run-script.mjs" "scriptPath" "disableWorkflows" "scope-fence" "/verify-" "context-sentinel-"; do \
  inP=$(grep -qc "$tok" "$P" && echo y || echo n); inM=$(grep -qc "$tok" "$M" && echo y || echo n); \
  echo "$tok  source=$inP  mitosis=$inM"; \
done
```
Expected: every token present in the source (`source=y`) is also present in mitosis (`mitosis=y`). A token that is `source=y mitosis=n` is an absorption gap — fix before Plan 5.

- [ ] **Step 3: Record the gate result for Plan 5**

State explicitly in the execution log: "Absorption parity PASS — mitosis reproduces all seven routing pieces; parallel-subagent-development is safe to delete in Plan 5." This sentence is the precondition Plan 5 Task 1 checks for. If parity is not PASS, do not proceed to Plan 5's deletion.

No commit step — `~/.claude` is non-git.

---

## Self-Review

**1. Spec coverage (this plan's slice — spec §5.1 Mitosis skill + the absorption precondition):**
- New top-level `mitosis` skill owning decompose -> clusters/MSPs -> fan out -> serialized merge — Task 1. COVERED (§5.1, §4 flow).
- Absorbs all seven routing pieces from parallel-subagent-development, reproduced with concrete mechanism — Task 1 Step 3 + Task 2 gate. COVERED (§5.1 "absorbs ... BEFORE that skill is deleted").
- Reuses (does not rebuild) wave-planner / route-planner / generate-run-script / resolve-superpowers / engine — Global Constraints + Task 1 Steps 2/5. COVERED (§5.1 reuse list).
- D1 decomposition stack referenced — Task 1 "Decomposition" section. COVERED (§3/§4).
- Calls plan-to-task-graph per MSP — Task 1 "Per-MSP planning". COVERED (§5.2 callable relationship).
- Merge/ship intent (receipts + D6 + branch contract + per-MSP squash) referenced as the forward hook Plan 4 wires — Task 1 "Merge and ship". COVERED at the prose level; concrete files in Plan 4 (§6/§7).
- Out of this plan's slice (later plans): the concrete receipts.config.json / receipts.yml / D6 step + branch-contract code + squash (Plan 4); deletion of parallel-subagent-development + spec-decomposition.md redirect (Plan 5). Tracked, not gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The skill body is shown in full; every verification step shows the exact command. PASS.

**3. Type consistency:** The engine-handoff invocation (`generate-run-script.mjs ... --base-branch ... --scoped-check ... --full-validation ... --isolation ...` then `Workflow({ scriptPath: "<plan>.run.js" })`) matches the Global Constraints and the real CLI interface mapped from `generate-run-script.mjs`. The route-planner output keys (`rule, lane, isolation, handoff, N, notes`) and the 11 input fields match the real `planRoute` contract. The parity tokens in Task 2 match strings actually written in Task 1. PASS.

**Note on adapted template:** this plan's deliverable is prose (a skill), so tasks use structural pre-state + anchor verification, not RED→GREEN unit tests, and have no commit steps — per the non-git Global Constraints. The absorption-parity gate (Task 2) substitutes for a behavioral test: it proves the capability is preserved before the source is removed.
