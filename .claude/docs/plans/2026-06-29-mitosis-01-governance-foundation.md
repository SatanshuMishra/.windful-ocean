# Mitosis Plan 1 — Governance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the global Three-Pillars governance rule and rewrite tool-routing to the D1 code-intelligence stack (native LSP oracle / Graphify map / Serena edit-only).

**Architecture:** Two prose rule files under `~/.claude/rules/common/`, referenced from `CLAUDE.md`. No runtime code. Because `~/.claude` is not a git repository and rule files have no executable behavior, each task's "test" is STRUCTURAL verification — file presence, required content anchors via grep, reference resolution, and style invariants — run as the per-task gate. There are no commit steps.

**Tech Stack:** Markdown rule files; `CLAUDE.md` include mechanism; `grep`/`rg` and `wc` for structural verification.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git` commands, NO commit steps. Per-task verification commands are the gate. The ledger has no commit step.
- The `protect-claude-config.sh` PreToolUse hook returns "ask" on writes under `rules/`, `skills/`, and `settings` paths — this is EXPECTED. The human approves each write. Do not treat the prompt as an error.
- NEVER write code comments (shebang/pragma carve-outs only). NEVER use emojis. NEVER add AI co-author attribution.
- Pinned versions, no auto-update in `~/.claude` config; version bumps are human-approved.
- `CLAUDE.md` must stay tiny — it loads into every project's context on every turn. New references are ONE line only.
- Three Pillars priority, verbatim: **1. Robustness/Quality of code; 2. Optimization (code AND Claude-driven development — tokens, context, cost); 3. Speed (code + development). Never trade a higher pillar for a lower one.**
- D1 stack, verbatim intent: **native LSP call hierarchy = dependency ORACLE (type-accurate); Graphify = orientation MAP + reliable file/import/inheritance layer (NOT the symbol-call oracle); Serena = edit-only (native LSP edit ops unshipped, anthropics/claude-code#40282 open).**

---

### Task 1: Three-Pillars governance rule + CLAUDE.md reference

**Files:**
- Create: `~/.claude/rules/common/pillars.md`
- Modify: `~/.claude/CLAUDE.md` (add one line to the "Global invariants" block)

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical priority order `Quality > Optimization > Speed`, referenced by `pillars.md` from CLAUDE.md and cited by later Mitosis plans (e.g., D1's accuracy-over-token-cost trade-off).

- [ ] **Step 1: Write the failing verification (structural test as a shell check)**

This rule file has no runtime; the "failing test" is the verification command run BEFORE the file exists, proving it currently fails.

Run:
```bash
test -f ~/.claude/rules/common/pillars.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`

- [ ] **Step 2: Create `~/.claude/rules/common/pillars.md`**

Write this exact content (the PreToolUse hook will prompt "ask"; approve it):

```markdown
# Three Pillars (global priority order)

Every trade-off across this configuration — every project, skill, agent, and the Mitosis workflow — resolves against one strict priority order. When two goals conflict, the higher pillar wins. Never trade a higher pillar for a lower one.

## The order (high to low)

1. **Robustness / Quality of code.** Correctness, safety, maintainability. The code must work and keep working.
2. **Optimization.** Efficiency of both the code AND Claude-driven development — tokens, context, and cost. Do more with less, but never at the expense of pillar 1.
3. **Speed.** Wall-clock speed of the code and of the development process. The fastest path is taken only among options that already satisfy pillars 1 and 2.

## Tie-break

Quality beats Optimization beats Speed. There is no trade that sacrifices a higher pillar to gain a lower one. A faster plan that risks correctness loses to a slower correct one; a token-cheaper tool with lower recall loses to an accurate one where accuracy is load-bearing.

## Scope

Applies to everything in the global configuration, not only the Mitosis workflow.

Worked example (D1 code-intel stack): the dependency oracle is accurate native LSP, not the token-free-but-lower-recall Graphify call graph — Quality over Optimization, even though the Graphify call is free.
```

- [ ] **Step 3: Verify the file exists and carries all three pillars in order**

Run:
```bash
test -f ~/.claude/rules/common/pillars.md && \
grep -n "Robustness / Quality" ~/.claude/rules/common/pillars.md && \
grep -n "Optimization" ~/.claude/rules/common/pillars.md && \
grep -n "Speed" ~/.claude/rules/common/pillars.md && \
grep -n "Never trade a higher pillar" ~/.claude/rules/common/pillars.md
```
Expected: PRESENT, and four matching lines printed with the quality line at a lower line number than optimization, which is lower than speed.

- [ ] **Step 4: Verify style invariants (no emoji, no AI attribution)**

Run:
```bash
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/rules/common/pillars.md ; echo "exit=$?"
```
Expected: no matches, `exit=1` (rg exits 1 when nothing matches).

- [ ] **Step 5: Add the one-line reference to `CLAUDE.md`**

In `~/.claude/CLAUDE.md`, inside the "# Global invariants (every project, no exceptions)" bullet list, add this single line (place it as the first bullet, since it governs all the others):

```markdown
- Resolve every trade-off by the Three Pillars: Quality > Optimization > Speed; never trade a higher for a lower. ~/.claude/rules/common/pillars.md
```

- [ ] **Step 6: Verify the reference resolves**

Run:
```bash
grep -n "rules/common/pillars.md" ~/.claude/CLAUDE.md && \
test -f ~/.claude/rules/common/pillars.md && echo "REFERENCE RESOLVES"
```
Expected: the CLAUDE.md line prints and `REFERENCE RESOLVES`.

No commit step — `~/.claude` is non-git.

---

### Task 2: Rewrite `tool-routing.md` to the D1 code-intelligence stack

**Files:**
- Modify: `~/.claude/rules/common/tool-routing.md`

**Interfaces:**
- Consumes: the D1 stack definition from the Global Constraints above.
- Produces: the canonical routing doc that names native LSP as the oracle, Graphify as the map (not the call-graph authority), and Serena as edit-only. Plan 2 (plan-to-task-graph) and Plan 3 (Mitosis) reference this routing.

**Context the implementer MUST read first:** the current `~/.claude/rules/common/tool-routing.md` casts graphify as the map, Serena as "GPS" for live symbol navigation, and native grep/Read as street view. D1 REASSIGNS the GPS/oracle role from Serena to native LSP, and demotes Serena to edit-only. Read the whole current file before editing so the precedence, setup, and safety-rail sections are preserved.

- [ ] **Step 1: Verify the current (pre-rewrite) state — the "red" baseline**

Run:
```bash
grep -nE "Serena = GPS|Serena = the GPS|find_referencing_symbols.* GPS" ~/.claude/rules/common/tool-routing.md ; echo "---"; \
grep -nc "graphify = the map" ~/.claude/rules/common/tool-routing.md
```
Expected: the current file still frames Serena as GPS (at least one match) and graphify as the map. This is the state we are changing.

- [ ] **Step 2: Read the full current file**

Run:
```bash
cat -n ~/.claude/rules/common/tool-routing.md
```
Expected: full file printed. Note the section headers: "## The three layers", "## Routing", "## Safety rail (the map can lag the diff)", "## Lookup vs evaluation", "## Setup", "## Precedence".

- [ ] **Step 3: Replace the "## The three layers" section**

Replace the entire "## The three layers" section body with this exact content (keep the `## The three layers` header):

```markdown
Four read/edit layers are available; pick by what the question needs. Default to orienting on the map, then drilling with the precise oracle. Do not default to one layer exclusively.

- **graphify = the map.** A knowledge graph of the project (modules, symbols, file/import/inheritance relationships, communities). Use it to ORIENT: where does X live, what clusters with it, how do modules and imports connect, where are the entry points. `graphify query "..."`, `graphify path A B`, `graphify explain <node>`. Built and kept fresh automatically; querying it is read-only and, for code, token-free. The map is RELIABLE for files, imports, and inheritance — it is NOT the symbol-call oracle (its call-graph recall is too low to gate parallel-safety; see the dependency-oracle layer).
- **native LSP call hierarchy = the dependency ORACLE (GPS).** Type-accurate caller/callee facts — the source of truth for "who calls / who is called by" and for semantic dependency edges. Use it to DRILL once the map has placed you, and whenever a dependency fact is load-bearing (parallel-safety, refactor blast radius). Corroborate the seams the oracle cannot see — dynamic dispatch, dependency injection, FFI, SQL, codegen — with targeted reads.
- **Serena = edit-only.** Symbol-targeted edits in large files: `replace_symbol_body`, `insert_after_symbol`, `rename_symbol`. Serena is NOT the navigation oracle — use native LSP for caller/callee facts (native LSP edit ops remain unshipped, anthropics/claude-code#40282 open, which is the only reason Serena is retained here).
- **native grep / Read / Glob = street view.** Plain text or regex over a known location, small files, logs, config, generated output. Use when you already know where to look.
```

- [ ] **Step 4: Update the "## Routing" section to drill with the LSP oracle, not Serena**

Replace the "## Routing" numbered list with this exact content (keep the `## Routing` header):

```markdown
1. **Orient on the map.** Start with graphify for "how does this fit together / where is X / what connects to Y" in a large or unfamiliar codebase.
2. **Drill with the native LSP oracle** for precise relational facts (every caller, every callee, refactor blast radius) and to confirm any dependency that gates parallel-safety. Corroborate dynamic/DI/FFI/SQL/codegen seams with targeted reads.
3. **Edit with Serena** for symbol-targeted changes in large files.
4. **Grep / Read** for local, known-location, plain-text work.

The order is a heuristic, not a law: for a known identifier, grep is the correct first call; for a concept, the map; for a load-bearing dependency fact, the LSP oracle.
```

- [ ] **Step 5: Update the "## Safety rail" section to point verification at the LSP oracle**

In the "## Safety rail (the map can lag the diff)" section, replace any instruction to "verify with Serena / LSP" so it reads "verify with the native LSP oracle". Apply this exact replacement to the bullet that currently names Serena for verification:

Find:
```markdown
- For files edited since the last refresh, or whenever you need EXACT CURRENT symbol facts (precise call sites, signatures, definitions), verify with Serena / LSP rather than trusting the map.
```
Replace with:
```markdown
- For files edited since the last refresh, or whenever you need EXACT CURRENT symbol facts (precise call sites, signatures, definitions), verify with the native LSP oracle rather than trusting the map. The map is structural, not a live call index.
```

- [ ] **Step 6: Sweep the rest of the file for stale "Serena = GPS / navigation oracle" framing**

Run:
```bash
grep -nE "Serena.*(GPS|oracle|find_referencing_symbols|find_implementations|navigation)" ~/.claude/rules/common/tool-routing.md
```
Expected after edits: any remaining matches are in the "Setup" section (activate_project) or the "What stays allowed"-style references only — NOT framing Serena as the navigation oracle. If a match still casts Serena as GPS/oracle/navigation, replace that clause to route navigation to native LSP and leave Serena as edit-only. Re-run until clean.

- [ ] **Step 7: Verify the rewrite — D1 anchors present, old framing gone**

Run:
```bash
grep -n "native LSP call hierarchy = the dependency ORACLE" ~/.claude/rules/common/tool-routing.md && \
grep -n "Serena = edit-only" ~/.claude/rules/common/tool-routing.md && \
grep -n "NOT the symbol-call oracle" ~/.claude/rules/common/tool-routing.md && \
echo "--- old framing must be ABSENT below ---" && \
( grep -nE "Serena = GPS" ~/.claude/rules/common/tool-routing.md ; echo "exit=$?" )
```
Expected: the three D1 anchor lines print; the final grep prints `exit=1` (no `Serena = GPS` framing remains).

- [ ] **Step 8: Verify style invariants and that no other section was lost**

Run:
```bash
for h in "## The three layers" "## Routing" "## Safety rail" "## Lookup vs evaluation" "## Setup" "## Precedence"; do \
  grep -q "$h" ~/.claude/rules/common/tool-routing.md && echo "KEPT: $h" || echo "MISSING: $h"; \
done; \
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/rules/common/tool-routing.md ; echo "emoji-exit=$?"
```
Expected: all six headers print `KEPT`; emoji scan prints `emoji-exit=1` (none found).

No commit step — `~/.claude` is non-git.

---

## Self-Review

**1. Spec coverage (this plan's slice — spec §2 governance + §3 D1 stack):**
- Three Pillars rule (`pillars.md`) + CLAUDE.md reference — Task 1. COVERED.
- tool-routing.md rewrite: LSP oracle / Graphify map / Serena edit-only, safety rail preserved, Graphify-as-call-authority demoted — Task 2. COVERED.
- Out of this plan's slice (deferred to later plans): plan-to-task-graph (§5.2), Mitosis skill (§5.1), receipts (§6), decommission + spec-decomposition.md redirect (§5.3/§5.4). Tracked in the roadmap, not gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every content step shows the exact file body or exact find/replace block. PASS.

**3. Type consistency:** No code types. Cross-references are exact file paths and exact section headers; the D1 anchor strings used in verification (Task 2 Steps 3 and 7) match verbatim. PASS.

**Note on adapted template:** the writing-plans TDD/commit template is adapted for a non-git prose-rules target — "failing test" becomes a pre-state verification command, and "commit" steps are removed per the Global Constraints. This is intentional, not an omission.
