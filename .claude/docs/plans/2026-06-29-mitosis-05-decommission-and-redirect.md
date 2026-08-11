# Mitosis Plan 5 — Decommission + Brainstorming Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `parallel-subagent-development` now that Mitosis has absorbed its routing (Plan 3), repoint the one hook that hard-codes its path, and add the non-invasive brainstorming redirect (`rules/common/spec-decomposition.md`) that routes SPEC-shaped work into Mitosis without editing vendored Superpowers files.

**Architecture:** One new rule file + one hook repoint + one skill deletion + a final orphan sweep. No runtime code. Deletion is GATED on Plan 3's absorption-parity PASS — the hard precondition that no routing capability is lost. The brainstorming redirect is a user rule plus the `mitosis` skill's `description:` (already set in Plan 3); together they surface Mitosis for SPEC/batch work without touching the vendored brainstorming skill.

**Tech Stack:** Markdown rule file; a Bash hook (`superpowers-drift-check.sh`); `grep`/`rg` for structural and orphan verification.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git` commands, NO commit steps. Per-task verification commands are the gate. Writes under `rules/`, `skills/`, hooks prompt "ask" via `protect-claude-config.sh` — approve; not an error.
- NEVER write code comments (shebang/pragma carve-outs only). NEVER use emojis. NEVER add AI co-author attribution.
- NEVER edit vendored plugin files under `plugins/cache/...`. The upstream `subagent-driven-development` and `executing-plans` skills there are NOT the deletion target; only the USER-owned `skills/parallel-subagent-development/` is.
- Three Pillars: Quality > Optimization > Speed; never trade a higher for a lower.
- DELETION PRECONDITION (hard): Plan 3 Task 2 must have recorded "Absorption parity PASS." Re-verify it in Task 3 below before deleting. If parity is not PASS, STOP — deleting now loses the heavy/light/inline lane routing.
- Orphan graph (live, user-owned references to `parallel-subagent-development`, from the map): `hooks/superpowers-drift-check.sh` (hard-coded path to the skill file); `ledger/PROJECT.md` (index lines — updated at session-handoff, not by this plan). `skills/parallel-plan-annotation/` already removed in Plan 2. Generated `graphify-out/` self-heals on refresh. `explain-my-config` references name the UPSTREAM `subagent-driven-development` skill (not this one) — leave as-is. `resolve-superpowers.mjs`/`generate-run-script.mjs` reference vendored-plugin PROMPT paths (not this skill) — leave as-is.

---

### Task 1: Brainstorming redirect rule — `rules/common/spec-decomposition.md`

**Files:**
- Create: `~/.claude/rules/common/spec-decomposition.md`

**Interfaces:**
- Consumes: the `mitosis` skill (Plan 3).
- Produces: the user rule that tells the agent when work decomposes into clusters/MSPs and to route it into Mitosis — the non-invasive half of the brainstorming redirect (the other half is the `mitosis` `description:`, set in Plan 3). Survives plugin updates because it edits no vendored file.

- [ ] **Step 1: Verify the rule does not exist yet (the "red" baseline)**

Run:
```bash
test -f ~/.claude/rules/common/spec-decomposition.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Create `~/.claude/rules/common/spec-decomposition.md`**

Write this exact content (the hook will prompt "ask"; approve it):

```markdown
# Spec Decomposition (route SPEC-shaped work into Mitosis)

When work is an approved SPEC or a batch of changes that splits into more than one independently shippable unit, it decomposes into clusters of MSPs (minimum shippable products) and is executed by the `mitosis` skill — NOT by ad-hoc subagent dispatch.

## When this applies

- An approved spec or plan covering multiple subsystems or multiple independent changes.
- Any "implement / execute this spec or batch" request where the work is larger than a single task.
- Parallel development where multiple changes must each leave a shared branch green.

## What to do

Invoke the `mitosis` skill. It owns the end-to-end flow: decompose into clusters/MSPs (D1 code-intelligence stack), order bottom-up, plan + harden each into a task graph (plan-to-task-graph), route and fan out into worktrees, and serialize merges through the receipts CI enforcer + the composed D6 check.

## What NOT to do

- Do NOT hand multi-task plans to a generic subagent loop; that path is retired.
- Do NOT edit the vendored Superpowers brainstorming skill; this rule plus the `mitosis` description are the redirect.

## Precedence

This rule and the `mitosis` skill supersede the retired `parallel-subagent-development` execution path. User instructions still outrank skills per the standard instruction-priority order.
```

- [ ] **Step 3: Verify the rule exists and routes to Mitosis**

Run:
```bash
R=~/.claude/rules/common/spec-decomposition.md; \
grep -n "the \`mitosis\` skill" "$R" && \
grep -n "clusters of MSPs" "$R" && \
grep -n "do NOT edit the vendored" "$R" -i && \
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" "$R" ; echo "emoji-exit=$?"
```
Expected: the three anchor lines print and `emoji-exit=1`.

No commit step — `~/.claude` is non-git.

---

### Task 2: Repoint the drift-check hook off the doomed skill path

**Files:**
- Modify: `~/.claude/hooks/superpowers-drift-check.sh` (the hard-coded path to the skill being deleted)

**Interfaces:**
- Consumes: the `mitosis` skill path.
- Produces: a drift-check hook that references a file that will still exist after Task 3's deletion, so the hook does not point at a missing path.

**Context the implementer MUST read first:** the current `~/.claude/hooks/superpowers-drift-check.sh`. The map located a hard-coded reference to `~/.claude/skills/parallel-subagent-development/SKILL.md` (around line 20) in the drift message/path. Read the file to see the exact surrounding text before editing.

- [ ] **Step 1: Locate the exact reference**

Run:
```bash
grep -n "parallel-subagent-development" ~/.claude/hooks/superpowers-drift-check.sh
```
Expected: at least one line (the hard-coded skill path and/or message). Note the exact text for the replacement.

- [ ] **Step 2: Repoint the path and message to `mitosis`**

In `~/.claude/hooks/superpowers-drift-check.sh`, replace every occurrence of the path segment `skills/parallel-subagent-development/SKILL.md` with `skills/mitosis/SKILL.md`, and update any human-readable message naming `parallel-subagent-development` to name `mitosis` instead. Preserve the surrounding shell logic exactly (only the path/skill-name strings change).

- [ ] **Step 3: Verify the repoint and that the hook still parses**

Run:
```bash
H=~/.claude/hooks/superpowers-drift-check.sh; \
grep -n "skills/mitosis/SKILL.md" "$H" && \
( grep -n "parallel-subagent-development" "$H" ; echo "old-ref-exit=$?" ) && \
bash -n "$H" && echo "SYNTAX OK"
```
Expected: the mitosis path prints; `old-ref-exit=1` (no stale reference remains); `SYNTAX OK` (the hook still parses).

No commit step — `~/.claude` is non-git.

---

### Task 3: Delete `parallel-subagent-development` (gated on absorption parity)

**Files:**
- Delete: `~/.claude/skills/parallel-subagent-development/` (the whole directory)

**Interfaces:**
- Consumes: the Plan 3 absorption-parity PASS; the Task 1 redirect; the Task 2 repoint.
- Produces: the retired skill removed, with Mitosis as the sole execution-routing owner.

- [ ] **Step 1: Re-verify the absorption-parity precondition against the live Mitosis skill**

Run:
```bash
M=~/.claude/skills/mitosis/SKILL.md; pass=1; \
check() { grep -q "$2" "$M" && echo "OK: $1" || { echo "MISSING: $1"; pass=0; }; }; \
check "lane selection (route-planner)" "route-planner.mjs '<inputs"; \
check "route-planner inputs" "context-sentinel-"; \
check "isolation selection" "scope-fence when single-wave"; \
check "engine handoff" 'Workflow({ scriptPath:'; \
check "dispatch notice / no gate" "do not wait for approval"; \
check "validation resolution" "/verify-<project>"; \
check "kill-switch" "disableWorkflows"; \
echo "PARITY=$pass"
```
Expected: seven `OK:` lines and `PARITY=1`. If `PARITY=0`, STOP — fix the Mitosis skill (Plan 3 Task 1) before deleting. Deleting without parity loses routing capability.

- [ ] **Step 2: Confirm no live user-owned pointer still targets the skill (except the ledger index)**

Run:
```bash
grep -rn "parallel-subagent-development" ~/.claude/skills ~/.claude/hooks ~/.claude/rules ~/.claude/workflows ~/.claude/lib ~/.claude/CLAUDE.md 2>/dev/null | grep -v "plugins/cache" ; echo "live-exit=$?"
```
Expected: the ONLY remaining match is inside `skills/parallel-subagent-development/` itself (the directory about to be deleted). No hook, rule, workflow, lib, or other skill references it (`live-exit=1` once the self-references are excluded). If another user-owned file references it, repoint that file first.

- [ ] **Step 3: Delete the skill directory**

Run (destructive — routing is absorbed into `mitosis`, verified in Step 1):
```bash
rm -rf ~/.claude/skills/parallel-subagent-development
```

- [ ] **Step 4: Verify the deletion**

Run:
```bash
test -d ~/.claude/skills/parallel-subagent-development && echo "STILL PRESENT (bad)" || echo "REMOVED"; \
test -f ~/.claude/skills/mitosis/SKILL.md && echo "MITOSIS PRESENT"
```
Expected: `REMOVED` and `MITOSIS PRESENT`.

No commit step — `~/.claude` is non-git.

---

### Task 4: Final orphan sweep

**Files:**
- Read-only verification across `~/.claude` (user-owned, non-vendored). No file is written.

**Interfaces:**
- Consumes: the post-deletion tree.
- Produces: confirmation that the only remaining references to the retired skills are in the ledger index (handled at session-handoff), generated `graphify-out/` (self-heals), and historical docs/notes/decisions (append-only) — nothing live or behavioral.

- [ ] **Step 1: Sweep for live references to both retired skills**

Run:
```bash
for name in parallel-subagent-development parallel-plan-annotation; do \
  echo "== $name =="; \
  grep -rln "$name" ~/.claude/skills ~/.claude/hooks ~/.claude/rules ~/.claude/workflows ~/.claude/lib ~/.claude/CLAUDE.md 2>/dev/null | grep -v "plugins/cache"; \
done; echo "done"
```
Expected: NO output under either heading (both retired skills have no live user-owned references in skills/hooks/rules/workflows/lib/CLAUDE.md). Any hit here is a real orphan — repoint or remove it.

- [ ] **Step 2: Confirm the new surface is in place**

Run:
```bash
for f in skills/mitosis/SKILL.md skills/plan-to-task-graph/SKILL.md rules/common/spec-decomposition.md rules/common/pillars.md \
  lib/superpowers-parallel/derive-edges.mjs lib/superpowers-parallel/branch-contract.mjs \
  skills/mitosis/templates/receipts.config.json skills/mitosis/templates/receipts.yml skills/mitosis/templates/d6-check.md; do \
  test -f ~/.claude/$f && echo "OK: $f" || echo "MISSING: $f"; \
done
```
Expected: every file prints `OK` — the full Mitosis surface from Plans 1–5 is present.

- [ ] **Step 3: Run the full lib suite one last time**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"
```
Expected: PASS — `derive-edges`, `branch-contract`, `route-planner`, `generate-run-script`, `scope-covers` all green; `# fail 0`.

- [ ] **Step 4: Note the ledger index for the session-handoff**

The `ledger/PROJECT.md` and the `msp-workflow` thread still list `parallel-subagent-development` / `parallel-plan-annotation` in their indexes. These are updated by the session-handoff skill (not a plan edit — the ledger is hand-off-owned). State in the execution log that the index needs the retirement reflected at the next hand-off.

No commit step — `~/.claude` is non-git.

---

## Self-Review

**1. Spec coverage (this plan's slice — spec §5.3 remove + §5.4 brainstorming redirect):**
- Brainstorming redirect via `rules/common/spec-decomposition.md` + the `mitosis` description (set in Plan 3) — Task 1. COVERED (§5.4).
- Repoint the one hook hard-coding the doomed skill path — Task 2. COVERED (orphan graph).
- Delete `parallel-subagent-development` ONLY after absorption parity, with the parity re-checked — Task 3. COVERED (§5.3 "ONLY AFTER 5.1 absorbs its routing").
- Final orphan sweep + new-surface confirmation + suite green — Task 4. COVERED (§5.3 "update every pointer").
- Vendored files untouched; upstream `subagent-driven-development` references left as-is — Global Constraints. COVERED (non-goal: never edit vendored).

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The rule body is shown in full; the hook edit is an exact string repoint guided by a read-first grep (a verify-then-edit, since the surrounding shell text is read before editing — not a placeholder). PASS.

**3. Type consistency:** The parity-anchor strings in Task 3 Step 1 match those written by Plan 3 Task 1 and checked by Plan 3 Task 2 verbatim. The new-surface file list in Task 4 Step 2 matches the files created across Plans 1–5. PASS.

**Note on adapted template:** prose/deletion deliverables use structural verification (anchor greps, `bash -n` syntax check, post-deletion existence checks) and have no commit steps, per the non-git Global Constraints. The deletion is gated behind a behavioral precondition (absorption parity) rather than a unit test, because the capability lives in another skill's prose.
