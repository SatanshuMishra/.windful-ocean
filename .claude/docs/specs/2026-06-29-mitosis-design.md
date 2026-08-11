# Mitosis — MSP-Driven Parallel Development (Design Spec)

Date: 2026-06-29
Thread: msp-workflow
Status: draft for review (pre-/writing-plans)
Supersedes the parallel-two-lane execution surface (parallel-subagent-development) and the v2 annotation skill.

This spec consolidates every locked decision for the MSP-driven workflow redesign into one buildable surface. It is the input to `/writing-plans`. Nothing here is applied to `~/.claude` until a plan is written and approved.

Decision provenance (canonical; this spec does not re-litigate them):
- `decisions/2026-06-29-three-pillars.md` — Quality > Optimization > Speed (global)
- `decisions/2026-06-29-msp-code-intel-stack.md` — D1: native LSP oracle + Graphify map + Serena edit-only
- `decisions/2026-06-29-msp-execution-model.md` — D2 / D4 / D5 / D6
- `decisions/2026-06-29-mitosis-skillset.md` — Mitosis skill + plan-to-task-graph rename/redesign + remove parallel-subagent-development
- `decisions/2026-06-29-receipts-adoption.md` — adopt receipts AS-IS into the merge-gate layer
- `decisions/2026-06-26-msp-driven-direction.md` — MSP unit + four clarifications (standing)
- `decisions/2026-06-26-msp-squash-and-branch-contract.md` — per-MSP squash + branch contract (standing)

---

## 1. Goal

Replace the single-feature-branch parallel executor with an MSP-driven model. An MSP (minimum shippable product) is the unit of work: the smallest change that ships independently and leaves its branch green and the app non-broken. The workflow decomposes a SPEC or batch into clusters of MSPs, fans them out across isolated worktrees with risk-scaled review, and serializes merges so every shared branch stays green at all times.

One named skill — **Mitosis** — owns the end-to-end flow: SPEC -> clusters/MSPs -> task graph -> parallel waves in worktrees -> serialized merge gated by the receipts CI enforcer + a composed D6 interaction check.

Non-goals (explicitly out of scope here):
- Per-work-type pipeline differentiation (deferred future; the receipts deployed-observation gate is the piece to be pipeline-scoped later).
- Re-deciding the squash or branch-contract behavior (standing decisions).
- Forking Graphify onto a SCIP/LSP backend (rejected in D1 as lower-ROI).

---

## 2. Governance — Three Pillars (global, not Mitosis-only)

Strict high-to-low priority used to resolve every trade-off across the whole config:

1. **Robustness / Quality** of code.
2. **Optimization** — both code efficiency and Claude-driven development (tokens, context, cost).
3. **Speed** — code and development.

Tie-break rule: **never trade a higher pillar for a lower one.** Quality beats optimization beats speed.

Build:
- `rules/common/pillars.md` — the full rule.
- One-line reference added to `CLAUDE.md`'s "Global invariants" block (loads every turn).

Worked consequence already baked into D1: the dependency oracle is accurate native LSP, not the token-free-but-lower-recall Graphify call graph — quality over optimization.

---

## 3. Code-Intelligence Stack (D1)

Three layers with distinct jobs; `rules/common/tool-routing.md` is rewritten to encode them:

- **Native LSP call hierarchy = the dependency ORACLE (GPS).** Type-accurate caller/callee facts. The source of truth for semantic dependency edges. Corroborated by targeted checks for the seams LSP cannot see: dynamic dispatch, dependency injection, FFI, SQL, codegen.
- **Graphify = orientation MAP + reliable file / import / inheritance layer.** A *core* component, but NOT the symbol-call oracle. Used to orient ("where does X live, what clusters with it") and for the file/import/inheritance relationships it computes reliably.
- **Serena = edit-only.** Symbol-targeted edits in large files. Not used as the oracle (native LSP edit ops remain unshipped — anthropics/claude-code#40282 open).

Why LSP over Graphify as oracle (D1 evidence): re-measured Graphify 0.9.1 on a real 1,624-file TS project showed ~13% average false-negatives, 25-32% on critical shared utilities, and silent zero-output on 8.7% of ambiguous labels. That recall is unacceptable for a dependency oracle that gates parallel-safety; it is fine for a map.

Hard limit acknowledged: no static oracle is 100% (Rice's theorem / dynamic dispatch). The residual is covered at merge time by D6, not pretended away at plan time.

tool-routing.md rewrite scope:
- Re-cast the "three layers" as: native LSP = GPS/oracle, Graphify = map, Serena = edit-only + native grep/Read = street view.
- Preserve the existing safety rail (the map can lag the diff; verify recent edits with the live oracle).
- Keep graphify as always-on/provisioned; demote any language that implies Graphify is the call-graph authority.

---

## 4. Execution Model (D2 / D4 / D5)

- **D2 — automation level: no mandatory human gate.** Even high-risk clusters auto-run. ALWAYS automate unless the user explicitly says otherwise. Consistent with the existing "dispatch notice, no cost gate" posture.
- **D4 — branch + worktree topology.** A per-feature integration branch; per-cluster (per-MSP) worktrees branched off it. Worktrees set `worktree.baseRef: "head"` — they branch from local feature state, NOT the remote default. (The "can't checkout multiple branches" worry was checkout-vs-worktree; git worktree supports concurrent multi-feature work, and per-feature branches enable it. CC worktree base-ref bugs #50850 / #60588 are CLOSED as of June 2026; peripheral edges #70466 / #67196 / #69802 remain open and are watched.)
- **D5 — hybrid orchestration.** Subagents handle judgment (decomposition, review, conflict reasoning); the Workflow engine handles deterministic task waves. This is the existing heavy-lane engine reused, not rebuilt.

Mitosis flow (end to end):

1. **Decompose** SPEC/batch -> clusters of MSPs, using the D1 stack (LSP oracle for dependency edges, Graphify map for orientation).
2. **Order** MSPs bottom-up (dependency order) for stacked shipping.
3. Per MSP: **plan -> task-graph (plan-to-task-graph) -> waves** via wave-planner.
4. **Fan out** each wave into worktrees (D4), hybrid-orchestrated (D5), risk-scaled review per task.
5. **Merge** serially into the integration branch through the receipts CI enforcer + composed D6 (Section 6).
6. **Ship** one auto-opened PR per MSP, stacked bottom-up; one squash per MSP at the published boundary (Section 7).

---

## 5. Skill Set (Mitosis skillset decision)

### 5.1 New skill: `mitosis`
Top-level entry skill. Owns: decompose SPEC/Batch -> Clusters/MSPs -> fan out in worktrees with risk-scaled review -> serialized merge keeping each feature branch green.

It **absorbs `parallel-subagent-development`'s execution-routing BEFORE that skill is deleted** — lane/isolation/engine-handoff selection (the route-planner.mjs inputs, the inline/light/heavy lane logic, the dispatch-notice/no-gate posture, the validation-command resolution, the kill-switch degradation). Losing that routing is a capability regression, so absorption is a hard precondition of deletion.

Reuses (KEEP, do not rebuild):
- `lib/superpowers-parallel/wave-planner.mjs` — wave layout from the graph.
- `lib/superpowers-parallel/route-planner.mjs`, `generate-run-script.mjs`, `resolve-superpowers.mjs` — routing + engine scaffolding.
- `workflows/parallel-plan-execution.js` — the per-MSP task engine (reassign ownership to Mitosis; the engine already requires `--base-branch` explicitly and merges `--no-ff`, see Section 7).

### 5.2 Rename + redesign: `parallel-plan-annotation` -> `plan-to-task-graph`
An internal callable of Mitosis (not a user-facing entry point). Redesign:
- **Two layers, separated by ownership:**
  - **INTENT layer (the Mitosis decomposer's judgment):** the things the decomposer decides from full SPEC context — task intent, risk, agentType, validation strategy, and its *declared* file scope / dependency / contract-pair edges. Authored by the Mitosis AI, never by a human (per D2: no human gate; plan-to-task-graph is an internal callable of Mitosis, not a user-facing entry point).
  - **STRUCTURE layer (machine-owned, deterministic):** dependency edges and write-set facts derivable from ground truth — the D1 LSP oracle (semantic call edges) + the Graphify file/import layer + pure fileScope-overlap analysis.
- **Auto-derived dependency edges are a MONOTONIC, add-only safety net.** The fallible actor is the AI decomposer, not a human; AI judgment over a large SPEC can drop a semantic edge. The STRUCTURE layer may ADD any edge the decomposer missed; it may NEVER remove or weaken a decomposer-declared edge. The graph is therefore never *less* serialized than ground truth demands. The oracle is a deterministic check on fallible AI judgment — not the source of intent.
- **Under-declaration lint (automated gate, no human review):** when ground truth reveals a dependency the decomposer did not declare, the missed edge is AUTO-ADDED (monotonic — the graph only gets safer) and recorded in an audit log. The run proceeds on the safer graph. The ONLY halt condition is a contradiction the monotonic add cannot resolve — e.g., a newly-implied cycle, meaning the decomposition itself is wrong — which halts loudly, mirroring wave-planner's existing cycle error. No human is in either path (D2).
- Preserve the v2 graph contract that still holds: `fullText` verbatim, exhaustive `fileScope`, contract-pair serialization (emit<->consume always edged, never same wave), shared-fixture/registry tests banned from per-task scoped checks (boundary-only), non-code tasks excluded from the graph, `risk` low|high drives review scaling, `agentType` routing (implementer/test-engineer/mechanical-editor).

### 5.3 Remove: `parallel-subagent-development`
Delete the skill + orphan cleanup, ONLY AFTER 5.1 absorbs its routing. Update every pointer (the skill's own preconditions chain, any rule referencing it).

### 5.4 Brainstorming redirect (non-invasive, survives plugin updates)
Route SPEC-shaped work into Mitosis decomposition without editing vendored Superpowers files:
- `rules/common/spec-decomposition.md` — user rule describing when work decomposes into clusters/MSPs and points at Mitosis.
- The `mitosis` skill's `description:` frontmatter — engages on the right phrasing so the router surfaces it.

---

## 6. Verification / Merge-Gate Layer — Receipts (adopt AS-IS)

Adopt the receipts plugin (github.com/shaheershoaib/receipts) with NO plugin modification. Three install pieces:
- Install the plugin globally (hooks/skill/MCP install globally and **stand down safely** in non-git or non-configured contexts — zero spurious blocks).
- Per-project `receipts.config.json` (config-driven: gates enable/disable, build.sha_source standdown, verify.test_command/suite_command, require_fresh_base, G10.mode).
- User-owned `.github/workflows/receipts.yml` invoking `uses: shaheershoaib/receipts/enforcer@main`.

Mapping receipts gates onto the Mitosis model:
- **CI enforcer (red->green receipt: test FAILS on base, PASSES on head)** = the strong, tracker-agnostic merge gate. This is the primary surface to rely on.
- **G8 replaces D4's rebase-check.**
- **G9 replaces the boundary-suite.**
- The **red->green receipt augments `verification-before-completion`** (evidence the change actually does something).
- **Keep annotation's plan-time contract-pair serialization** AND **add G10 as a merge-time backstop** (plan-time contract + merge-time backstop are complementary, not redundant).
- **Compose D6 as a separate CI step** in the user-owned `receipts.yml`, BESIDE the enforcer — because G7 (receipts' dependent-test-selection, ~= D6) is unbuilt (design doc only). No plugin edit needed.

Two hard edges to design around:
- The **session-end verification Stop hook is hardcoded to `notion-update-page`** (stop-verification-gate.py:177) — inert on any other tracker, NOT config-fixable. **Do not depend on it.** Rely on the CI enforcer.
- **G7 / D6 is unbuilt** -> Mitosis supplies its own D6 interaction check as the composed CI step above.

D6 itself: cluster-boundary interaction tests covering the irreducible semantic-conflict residual that no static oracle catches (Section 3). These assert behavior across MSP/cluster boundaries — the seams (dynamic/DI/FFI/SQL/codegen) where LSP recall fails.

---

## 7. Shipping Contract (MSP direction + squash + branch contract)

Four standing clarifications (2026-06-26-msp-driven-direction):
1. **One auto-opened PR per MSP**, stacked bottom-up (not one PR per feature).
2. **Parallel-safety applies to EVERY shared branch** — including multiple worktrees off one feature branch AND the solo single-developer case. Every merge leaves the branch green and the app non-broken.
3. **Branching is detected-then-confirmed per project** — no hard-coded master->development->feature. Degrade to atomic commits, or `git init`, when no repo.
4. **History via branch isolation + one squash per MSP.**

Squash + branch contract (2026-06-26-msp-squash-and-branch-contract):
- **Per-MSP squash** at the MSP->integration PUBLISHED boundary: published history gets ONE squashed commit per MSP; atomic commits stay on the feature branch. Accepts the bounded loss of sub-PR `git bisect` granularity. If Conventional-Commits / semantic-release is in play, the squash message (PR title) must be CC-formatted -> **add PR-title linting.** (The engine merges `--no-ff` intra-run at parallel-plan-execution.js:210; squash applies at the published boundary, not necessarily intra-run wave merges.)
- **Branch target/source = "declare-or-pass-or-ASK, NEVER default."** Resolution order for BOTH source/head AND base/target: explicit pass -> declared machine-readable config -> **STOP AND ASK.** NEVER derive base from the platform default branch; NEVER assume source. Defaulting a PR onto master/main is a CRITICAL failure the user forbids. Heuristic name detection is rejected. The engine already requires `--base-branch` explicitly; generalize its on-main/master guard into the full contract.

---

## 8. Environment Constraint — `~/.claude` is non-git

The worktree topology, serialized merge queue, and receipts CI enforcer govern the OTHER git projects Mitosis runs in. In `~/.claude` itself (non-git):
- No worktrees / merge queue / enforcer — they degrade to **serial apply** (and per the global ledger, no commit step; per-task verification commands are the gate).
- Receipts hooks/skill/MCP still install globally and **stand down** with zero spurious blocks.
- This spec's own application to `~/.claude` (building the skills/rules) is therefore a serial, human-approved apply — the protect-claude-config PreToolUse hook returns "ask" on rule/skill/settings writes (expected).

---

## 9. Build Inventory (what /writing-plans will phase)

NEW:
- `skills/mitosis/SKILL.md` (+ any helper assets) — entry skill, absorbs routing.
- `skills/plan-to-task-graph/SKILL.md` — renamed + redesigned annotation (INTENT/STRUCTURE split, monotonic auto-edges, under-declaration lint).
- `rules/common/pillars.md` + CLAUDE.md reference line.
- `rules/common/spec-decomposition.md` — brainstorming redirect.
- Receipts adoption artifacts: per-project `receipts.config.json` template + `.github/workflows/receipts.yml` template (enforcer + composed D6 step) + a D6 interaction-test convention.

REWRITE:
- `rules/common/tool-routing.md` — D1 stack (LSP oracle / Graphify map / Serena edit-only).

REUSE (unchanged or lightly re-owned):
- `lib/superpowers-parallel/{wave-planner,route-planner,generate-run-script,resolve-superpowers}.mjs`.
- `workflows/parallel-plan-execution.js` (generalize the base-branch guard into the branch contract; squash at published boundary).

REMOVE (after absorption):
- `skills/parallel-subagent-development/` + orphan-pointer cleanup.

DEPENDENCY ORDER (for planning): pillars + tool-routing (governance) -> plan-to-task-graph redesign + routing absorption -> mitosis skill -> receipts adoption + D6 -> remove parallel-subagent-development -> repoint brainstorming redirect.

---

## 10. Open Risks / Watch Items

- The plan-to-task-graph redesign couples to the D1 oracle availability; where native LSP is absent for a language, the monotonic safety net degrades to Graphify file/import edges + the decomposer's declared edges only (the pure fileScope-overlap lint still fires; only the semantic-call cross-check is reduced).
- receipts' Notion-coupled Stop hook must stay un-depended-on; if a future receipts release de-hardcodes it, revisit.
- Peripheral CC worktree bugs (#70466 / #67196 / #69802) remain open — watch for base-ref regressions.
- Absorption of parallel-subagent-development routing must be verified COMPLETE (lane/isolation/engine-handoff/kill-switch) before deletion, or the heavy/light/inline lane capability is lost.
- WIP hygiene: `vibesec-integration` thread is also paused (unrelated) — dispose or sequence before broad new work if a clean board is wanted.
