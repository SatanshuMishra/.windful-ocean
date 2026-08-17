# Agent Roster and Observer Rebuild — SPEC

**Status:** draft
**Date:** 2026-08-17
**Thread:** 01M04HH9W6HVPQJDPW24WH48GC
**Authority:** decision 0501 (the approved target architecture), corrected by decision 0500
**Supersedes:** the 2026-07-14 SPEC on thread 01KYERC4Y2XFVQ5GFQRRV0BKTS

## 1. What this builds

Replace the 15 current agent definitions with 13 agents in four bands, and replace the
observation hook that records their runs. The roster shape, tool grants, delegation
boundary and observer record are fixed by decision 0501 and are not reopened here. This
SPEC decides only HOW that lands: the order, the unit boundaries, and the check that
proves each unit did not break the configuration it merged into.

## 2. Reading order, and a warning

Read decision 0501 for the approved definition and decision 0500 for the corrections,
together, before implementing anything.

The decision set contains four records whose factual premise moved after they were
written. 0500 is the only place those corrections exist. Specifically:

- Records 0470, 0479 and 0481 each cite "zero compliance across 15,573 runs". That figure
  is disproven. 0490 re-grounded two of them and missed 0479.
- Record 0488 pins seven schema-capable dispatchable agents. The live count is five.

Anything sized or reasoned against the originals inherits all of it.

Use the `logbook-inline` ledger store. The sibling `logbook-logbook` store is missing
decisions 0495 and 0496, so reading the wrong path returns a plausible near-complete
answer rather than an obvious nothing.

## 3. Global constraints

Every unit below inherits this section. Values are exact.

| Constraint | Value |
|---|---|
| Platform | Claude Code 2.1.233 (`/opt/homebrew/Caskroom/claude-code@latest/2.1.233/claude`) |
| Agent definitions | `.claude/agents/*.md`, symlinked live from `~/.claude/agents` |
| Rules | `.claude/rules/**`, symlinked live from `~/.claude/rules` |
| Skills | `.claude/skills/**`, symlinked live from `~/.claude/skills` |
| Observer output | `~/.claude/agent-ledger/events/YYYY-MM-DD.jsonl` |
| Dispatch tool grant | `Agent` tool: the four Leads only |
| Skill tool grant | `Skill` tool: the four Leads only |
| Skill reach, non-Leads | `skills:` frontmatter only |
| Skill naming | Fully qualified `plugin:skill`. Bare names are forbidden |
| Comments | No code comments in any authored file. Tool-required pragmas only |
| Emoji | None, anywhere |
| Commits | Conventional Commits, no AI co-author attribution |
| Pull requests | `node .claude/lib/git/pr.mjs pr-create` only. Ad-hoc `gh pr create` is denied at the gate |
| Merge | Human-gated. No unit merges itself |
| Verification standard | `receipts/gates@1.1`. Acceptance is a ceiling, declared before the unit starts |

Four platform facts constrain the design and are not negotiable, each established by
direct inspection of the shipping binary rather than by inference:

1. An agent's `tools:` line is a strict allowlist. A tool absent from it does not exist
   for that agent.
2. The skill *index* is gated on the `Skill` tool. An agent holding neither `Skill` nor a
   `skills:` frontmatter field receives no skill content at all — not even names.
3. `skills:` frontmatter inlines each named skill's **entire SKILL.md body** at spawn, on
   every dispatch, unconditionally. Side files are never inlined; they are written to disk
   and reached through the absolute path the preload supplies.
4. An unknown name in `skills:` logs a warning and spawns the agent **without** it. Failure
   is silent.

## 4. The invariant that determines the whole shape

Every unit, when merged, must leave the configuration working. This is not a style
preference here — it is unusually literal, because `~/.claude/agents`, `~/.claude/rules`
and `~/.claude/skills` are symlinks into the primary checkout's working tree. A merge that
lands a broken roster does not wait for a deploy; it changes the running configuration of
every subsequent session the moment the checkout reaches that commit.

Three consequences follow, and they force the ordering rather than suggesting it.

**A rename cannot be atomic across the coupling surface.** Skills, rules and the mitosis
engine name agents by string. Deleting `debugger` while any of them still names it
produces a dispatch to an agent that does not exist. Therefore the roster change is
strictly expand → migrate → contract: add the new agents while the old ones still exist
and are still referenced; repoint every reference; only then delete the old definitions,
with a census proving nothing still names them.

**Bottom-up within the expand phase.** The four Leads hold the dispatch tool and route work
to the nine executing agents. A Lead merged before its targets exist is broken on arrival.
Executing agents land first.

**Mechanism before use.** The body-composition generator, its drift check, and the
name-integrity census must exist and pass against the *current* state before anything
depends on them. A check introduced alongside the change it is meant to gate has never
been observed failing, and an unfalsifiable check is the specific defect this thread has
now caught three times: an observer verified by a probe that could not fail, a
drift detector that silently skipped two thirds of its subjects, and a confirmation rule
that outlived the code enforcing it. Each returned a clean result indistinguishable from a
real one.

**Colliding names break expand-then-contract, and must be handled separately.** The pattern
in the first consequence assumes the new agent and the old one can coexist. That holds only
where the names differ. Where a new agent reuses a current agent's filename, adding it
OVERWRITES the old definition — there is no coexistence phase, and every reference to that
name switches behaviour at the merge rather than at the migrate step.

At least one collision is certain: `researcher` is both a current agent (read-only research
worker) and one of the four Leads named in decision 0501. The full collision set cannot be
enumerated until the nine executing-agent names are fixed.

Colliding names are therefore specified as MODIFY units, never ADD units, and each carries
two extra acceptance obligations beyond the standard three:

1. Every existing reference to that name must still resolve after the merge, asserted by
   the census rather than by reading.
2. The behavioural change must be intentional and stated. A reference written against the
   old agent's contract now reaches an agent with a different scope and, for a Lead, a
   materially wider tool grant — including the dispatch tool. That widening is the point of
   the design, but it happens at this merge rather than at the migrate step, so it is
   declared here rather than discovered later.

Where a collision cannot satisfy both, the unit ships the new agent under its own distinct
name and the old name is retired in the contract wave like any other. Renaming to avoid a
collision is always available and is preferred over a silent behavioural swap.

## 5. Acceptance, per unit

Each unit declares its acceptance BEFORE work starts, as a command that can be re-run, not
as prose to be graded. The declared criterion is the complete definition of done for that
unit; anything discovered above it is filed as a new item and never folded in.

Every unit's acceptance has the same three parts:

1. **A check that is RED on the parent commit and GREEN on the unit.** A check that has
   never failed proves nothing.
2. **An inertness mutation.** Revert or empty the thing the unit added; the check must turn
   red. A check that survives that mutation is not testing the unit.
3. **A no-collateral assertion.** The specific thing this unit must NOT have touched,
   asserted by diff. For a prose unit that is the gate script and settings; for an additive
   unit it is the set of files that existed before.

Any census a unit introduces is a closed census: it halts on the unclassifiable. A pinned
count or a sampled allowlist is forbidden — both are change-detectors wearing a census
costume, and both pass while the thing they claim to cover rots.

Where a unit cannot clear its own criterion, the outcome is a tracked ladder status —
`fixed`, `unverified-reasoned`, `speculative`, `reverted` — never another review round and
never a silent pass.

## 5a. Blocking precondition — read before scheduling anything

The report states one hard dependency, and it is external to this SPEC:

> **The new mitosis engine lands FIRST.** This work targets that engine, not the one being
> deleted. (report Section 13)

The rebuild targets an engine still in flight on a feature branch, tracked on thread
`01KZTEFMENXBW30ZE633YNFJHE`, which currently stands at 8 of 15 criteria and whose own
spine records that it FAILED its stated goal, reaching only "checkpointed-and-green".

No unit in wave 3 or later may start until that engine is on `main`. Waves 0 through 2
touch only the observer, the check mechanisms and the skills, none of which depend on the
engine, and may proceed regardless.

This is a scheduling fact, not a recommendation. A roster built against the engine being
deleted is wasted work.

## 5b. The roster, exactly

Thirteen agents. Six reuse a current filename, seven are new, nine current definitions are
deleted. `StructuredOutput` is REQUIRED on all thirteen — the
`dispatchable-agent-schema-capable` gate fails any agent that omits it.

| # | Agent | Band | Model | Effort | Agent tool | Skill tool | Preloaded skill | File action |
|---|---|---|---|---|---|---|---|---|
| 1 | delivery-lead | Lead | opus | high | YES | YES | `mitosis`, `verification-discipline` | ADD |
| 2 | architect | Lead | opus | high | YES | YES | `writing-plans` | ADD |
| 3 | investigator | Lead | opus | high | YES | YES | `systematic-debugging` | ADD |
| 4 | researcher | Lead | opus | high | YES | YES | `context7-mcp` | **MODIFY (collision)** |
| 5 | implementer | Maker | sonnet | medium | no | no | `context7-mcp` | **MODIFY (collision)** |
| 6 | test-engineer | Maker | sonnet | medium | no | no | `test-driven-development` | **MODIFY (collision)** |
| 7 | platform-engineer | Maker | sonnet | medium | no | no | **none — must be authored** | ADD |
| 8 | release-engineer | Maker | sonnet | medium | no | no | `pr` | ADD |
| 9 | code-reviewer | Verifier | opus | high | no | no | `receiving-code-review` | **MODIFY (collision)** |
| 10 | security-reviewer | Verifier | opus | high | no | no | `receiving-code-review` | **MODIFY (collision)** |
| 11 | conformance-auditor | Verifier | opus | high | no | no | **none — must be authored** | ADD |
| 12 | verifier | Verifier | sonnet | **low** | no | no | `receipts: gates` | ADD |
| 13 | technical-writer | Scribe | sonnet | medium | no | no | `visual-explainer` | **MODIFY (collision)** |

`investigator` additionally receives browser automation through the `mcpServers` frontmatter
field.

**Deleted in the contract wave (9):** `codebase-analyst`, `data-engineer`, `debugger`,
`devops-engineer`, `mechanical-editor`, `performance-engineer`, `report-writer`,
`solution-architect`, `verification-strategist`.

**Duty mapping, stated by the report:** codebase-analyst → investigator; debugger →
investigator (diagnosis) + implementer (the fix); solution-architect → architect;
report-writer → technical-writer; mechanical-editor → implementer; performance-engineer →
investigator (measure) + implementer (change); data-engineer → platform-engineer;
devops-engineer → platform-engineer; verification-strategist → verifier.

`claude-code-guide` and `statusline-setup` appear in the dispatchable agent list but are
Claude Code built-ins, not files under `.claude/agents/`. They are untouched by this work.

### Gaps this SPEC must close, which the report leaves open

1. **Two preloaded skills do not exist.** `platform-engineer` and `conformance-auditor` are
   assigned "none exists — gap". Each must be authored before its agent ships, or the agent
   ships with no `skills:` field and therefore, per platform fact 2, no skill content at all.
2. **`release-engineer` is described as keeping "its name and scope", but no such agent file
   exists today.** It is an ADD, not a retention. Decision 0487 discusses it as though it
   were live.
3. **The observer's output path and filename pattern are never stated.** The report fixes
   rotation ("by month") and format (append-only JSONL, read with DuckDB) but gives no path.
   The old path is explicitly not reused — the archive decision is "new observer, new format,
   no backward compatibility."
4. **No field in the observer record has a declared type.** Section 11e gives field names and
   the question each answers, and nothing else.
5. **`cost` and `permission_denials` are named in the engine-adapter prose but are not fields
   in the record table.** Either they are fields or the prose is wrong; the report does not
   resolve it.

## 6. Unit sequence

Units are grouped into waves. Within a wave, units are independent and may ship in any
order or in parallel. A wave does not start until the previous wave is merged, because
each wave's units depend on a mechanism the previous wave installed.

Dependencies are stated as unit ids, not as prose.

| Wave | Units | Gated on |
|---|---|---|
| 0 | U0.1 | nothing |
| 1 | U1.1, U1.2, U1.3 | nothing; U1.2 and U1.3 need U1.1 |
| 2 | U2.1, U2.2 | wave 1 |
| 3 | U3.1 → U3.2 → U3.3 → U3.4 | wave 1 |
| 4 | U4.1, U4.2 | **the mitosis engine on `main`** (§5a), wave 1, wave 2 |
| 5 | U5.1, U5.2 | wave 4 |
| 6 | U6.1, U6.2 | wave 5 |
| 7 | U7.1 | wave 6 |

Waves 0–3 do not touch the roster or the engine and may proceed now. Waves 4–7 are blocked
by §5a.

---

### U0.1 — Archive the telemetry

**Deliverable:** `~/.claude/agent-ledger/events/` copied to a dated archive outside the
active path. No code changes.
**Depends on:** nothing.
**Why now:** 8.9 MB across 47 files spanning 2026-07-02 to today is the only artifact in
this work that cannot be regenerated. The rebuilt observer uses a new format with no
backward compatibility, so this is the last moment the old baseline is recoverable.
**Must not touch:** any file under `.claude/`.
**Acceptance:** archive byte-count and file-count equal the source; `sha256` of a
concatenation matches. Inertness: delete one archived file, the comparison fails.
**Green on merge:** changes nothing the configuration reads.

### U1.1 — Make the agent-directory resolver canonical

**Deliverable:** `.claude/lib/mitosis/agent-schema-lint.mjs:14-16` no longer resolves the
roster relative to its own module path.
**Depends on:** nothing.
**Why first:** `agentDefinitionDir()` returns `new URL('../../agents/', import.meta.url)` —
two directories up from wherever that file physically sits. All 18 worktrees carry their own
real, non-symlinked copy of both that module and `.claude/agents/`. Whenever the module loads
with a worktree as cwd — which is exactly what mitosis does for every in-flight unit — the
gate censuses **that worktree's frozen roster** instead of the canonical one. Every
census-gated unit below is worthless until this is fixed, because a stale roster can silently
satisfy it.
**Must not touch:** `determinism-lint.mjs`, `mitosis-gate-core.mjs` wiring, any agent file.
**Acceptance:** a test that loads the module from a synthetic nested directory and asserts it
still resolves the canonical roster. RED on parent (returns the synthetic path), GREEN on fix.
Inertness: restore the module-relative expression, the test fails.
**Green on merge:** the resolver returns the same directory it does today when run from the
primary checkout; only the worktree case changes.

### U1.2 — Name-integrity census

**Deliverable:** a closed census asserting every agent name and every skill name referenced
as a routing or dispatch instruction under `.claude/rules/`, `.claude/skills/` and
`.claude/lib/` resolves to a real definition.
**Depends on:** U1.1.
**Must not touch:** anything it censuses.
**Acceptance:** GREEN on current `main`. This is the one unit whose check is green from
birth, so its proof is the inertness mutation alone: inject a reference to a non-existent
agent and to a non-existent skill; both must turn it RED, and it must name the file and line.
The census halts on an unclassifiable token — a pinned count or an allowlist is a rejection
of the unit.
**Classification it must implement:** LIVE DISPATCH and ROUTING INSTRUCTION break on rename;
DESCRIPTIVE and HISTORICAL do not. `.claude/docs/` is HISTORICAL in bulk — 471 matching lines
across 47 files, all dated records — and is excluded, with one exception: this SPEC itself is
live and must be excluded by path, not by folder.
**Green on merge:** adds a check, changes no behaviour.

### U1.3 — Body composition and drift check

**Deliverable:** shared fragments, a generator that composes an agent body from fragments
plus a per-agent section, and a check that fails when a generated file diverges from its
source. No agent is regenerated by this unit.
**Depends on:** U1.1.
**Also carries the pointer resolver, per decision 0503.** The generator emits each
oversized procedure's absolute path by resolving it from `installed_plugins.json` at
generation time. Pointers are never hand-written. Reuse
`.claude/lib/mitosis/superpowers-prompts.mjs`, which already reads the current manifest entry
and falls back to a semver-descending glob over the plugin cache — do not write a second
resolver.
**Must not touch:** `.claude/agents/*.md`, `superpowers-prompts.mjs`'s existing behaviour.
**Acceptance:** three checks, all three required.
1. Generator produces a fixture agent byte-identically from fragments. Drift check RED when
   the fixture is hand-edited, GREEN when regenerated.
2. A generated pointer resolves to a file that exists on disk.
3. **Plugin-drift case:** point the resolver at a synthetic manifest naming a different
   version; the drift check must turn RED against a body generated from the previous one.
   This is the check that converts a plugin upgrade from silent breakage into a failure, and
   it is the reason this unit precedes every agent unit.

Inertness, per check: empty the comparison and case 1 passes wrongly; drop the existence
assertion and case 2 passes with a dangling path; pin the resolver to a constant and case 3
stops reacting to the manifest.
**Green on merge:** no live agent file changes.

### U2.1 / U2.2 — Author the two missing skills

**Deliverable:** the preloaded skill for `platform-engineer` (U2.1) and for
`conformance-auditor` (U2.2). Both are assigned "none exists" by the report.
**Depends on:** wave 1.
**Shape:** router form from birth — a SKILL.md under 4 KB carrying a duty-to-file routing
table, with procedures in side files reached through the absolute base directory the preload
supplies.
**Why this cannot be deferred to the agent's own unit:** an agent with no `Skill` tool and no
`skills:` field receives no skill content at all, and an unknown name in `skills:` logs a
warning and spawns the agent anyway. Shipping either agent first produces one that runs with
zero procedure and surfaces no error.
**Must not touch:** `.claude/agents/`, existing skills.
**Acceptance:** SKILL.md parses, is under 4 KB, every side file its routing table names
exists, and every skill reference is fully qualified. Inertness: remove a side file, the
check names it.
**Green on merge:** a new skill nothing yet preloads.

### U3.1 — Observer write path

**Deliverable:** the rebuilt observer writing one append per run to a new path in the new
format, running alongside the current `agent-run-analyzer.mjs`, which stays authoritative.
**Depends on:** wave 1.
**Record:** `ts`, `subject`, `event`, `session_id`, `project`, `agent_id`,
`agent_transcript_path`, `agent_type`, `parent_agent`, `depth`, `duration_ms`, `tokens_in`,
`tokens_out`, `cache_read`, `cache_creation`, `tool_calls`, `num_turns`, `outcome`,
`receipt_verdict`, `fallback_reason`, `denial`, `source`. `model` and `effort` are excluded
per decision 0496. Every field carries a declared type — the report declares none, so this
unit fixes them and they become the contract.
**Mechanism:** POSIX `O_APPEND` line write, no lock. Monthly rotation. No write-time
computation of any kind.
**Must not touch:** the existing analyzer, its output path, or its hook registration.
**Acceptance:** a synthetic payload produces exactly one line with every declared field at
its declared type; two concurrent writers produce two intact lines. Inertness: remove the
`O_APPEND` flag, the concurrency case interleaves and fails.
**Green on merge:** purely additive. The current observer continues unchanged.

### U3.2 — Bind SubagentStart

**Deliverable:** the observer also fires on `SubagentStart`, which is the only event carrying
the parent for the `parent_agent` join.
**Depends on:** U3.1.
**Acceptance:** a dispatch produces a start row and a stop row sharing one `agent_id`, and
the start row's `parent_agent` names the dispatcher. Inertness: drop the start binding, the
join is empty.
**Green on merge:** adds rows to the new log only.

### U3.3 — Audit-time query skill

**Deliverable:** a skill that answers the standing questions over the new log with DuckDB:
which agents ran and at what cost, which dispatches fell back and why, what was blocked, what
failed, which agents are unused, which downgrade reasons recur.
**Depends on:** U3.2.
**Acceptance:** each standing question returns a result against a fixture log with known
answers. Inertness: corrupt one fixture row, the affected query's answer changes.
**Green on merge:** additive.

### U3.4 — Cut over and retire the old observer

**Deliverable:** `agent-run-analyzer.mjs` and its hook registration removed; the new observer
becomes sole writer.
**Depends on:** U3.3, U0.1.
**Acceptance:** the new log receives rows and the old path receives none, asserted after a
real dispatch. Inertness: re-register the old hook, the assertion fails.
**Green on merge:** observation continues without a gap. This is the only unit in wave 3 that
is not additive, which is why it is last.

### U4.1 — Add the four non-Lead new agents

**Deliverable:** `platform-engineer`, `release-engineer`, `conformance-auditor`, `verifier`,
generated from fragments per U1.3.
**Depends on:** §5a, U1.3, U2.1, U2.2.
**Must not touch:** any existing agent file.
**Acceptance:** all four pass `dispatchable-agent-schema-capable`, each declares
`StructuredOutput`, none declares the `Agent` or `Skill` tool, and the drift check is green.
Per decision 0503, delivery is checked two ways: every `skills:` entry is fully qualified,
resolves, and is **at or under 4 KB**; every body pointer resolves to a file that exists.
Inertness: remove `StructuredOutput` from one, the gate names it; swap one preload for a
skill over 4 KB, the size assertion names it.
**Green on merge:** four new names nothing yet references.

### U4.2 — Add the three new Leads

**Deliverable:** `delivery-lead`, `architect`, `investigator`. `investigator` additionally
declares browser automation through `mcpServers`.
**Depends on:** U4.1 — a Lead holds the dispatch tool and routes to executing agents, so it
is broken on arrival if they do not exist.
**Acceptance:** as U4.1, except each declares both `Agent` and `Skill`. Inertness: same shape.
**Green on merge:** three new names nothing yet references.

### U5.1 — Modify the five low-risk collisions

**Deliverable:** `implementer`, `test-engineer`, `code-reviewer`, `security-reviewer`,
`technical-writer` re-generated to their new band, dials and `skills:` assignment.
**Depends on:** wave 4.
**Why grouped:** each keeps its name and its role, gaining a preload and adjusted dials. No
caller's expectation is inverted.
**Acceptance:** the census proves every existing reference to all five still resolves; the
drift check is green; each preload resolves. Inertness: point one `skills:` entry at a
non-existent skill, the resolution check names it — this is the silent-degradation failure
mode and must be caught here, not in production.
**Green on merge:** every name still resolves; behaviour changes within the same role.

### U5.2 — Modify `researcher`

**Deliverable:** `researcher` becomes a Lead holding `Agent` and `Skill`.
**Depends on:** U5.1.
**Its own unit, deliberately:** this is the one collision that inverts a caller's
expectation. The current `researcher` is a read-only worker that cannot delegate; the new one
can dispatch. Six routing instructions name it — `research.md:7,9,12,13,17` and
`.claude/CLAUDE.md:13` — all written against the old contract, and all silently reach an
agent with a materially wider grant the moment this merges.
**Acceptance:** in addition to U5.1's checks, each of the six references is read and either
confirmed still correct under the new contract or amended in this unit. That is a stated
review, not an automated one, and it is recorded per reference.
**Green on merge:** the name resolves; the widening is declared here rather than discovered.

### U6.1 — Repoint the engine literals

**Deliverable:** `decompose-emit.mjs:16` `DECOMPOSER_AGENT` moves from `'codebase-analyst'`
to `'investigator'`.
**Depends on:** wave 5.
**Why isolated:** `codebase-analyst` is the only retiring name that is a live engine string
literal. `run-engine.mjs`'s literals (`implementer`, `test-engineer`, `code-reviewer`,
`security-reviewer`) are all collision names that survive, so they need no change — verify
this rather than assume it.
**Acceptance:** `agent-schema-lint.test.mjs`'s asserted derived set updates to match, and the
gate is green. Inertness: revert the literal, the census reports `codebase-analyst` as
referenced-but-absent once U7.1 lands.
**Green on merge:** the decomposer dispatches an agent that exists, because wave 4 added it.

### U6.2 — Repoint the rules and skills

**Deliverable:** every breaking reference updated. Exactly:
`.claude/rules/common/tool-routing.md:30` (`debugger`, `codebase-analyst`), `:32`
(`codebase-analyst`); `.claude/rules/common/performance.md:52` (`debugger`);
`.claude/rules/common/git-workflow.md:13` (`solution-architect`);
`.claude/rules/common/delegation-discipline.md:33` (the `report-writer.md` citation);
`.claude/skills/verification-discipline/SKILL.md:13,14,23` and
`.claude/skills/verify-setup/SKILL.md:8,38` (`verification-strategist`);
`.claude/skills/plan-to-task-graph/SKILL.md:20` (`mechanical-editor`);
`.claude/skills/report/SKILL.md:16` (`report-writer`).
**Depends on:** U6.1.
**Note on the `report` skill:** decision 0481 withdraws it. If it is deleted in this unit its
reference is moot; if it is retained, the reference must be repointed. Decide explicitly —
leaving a withdrawn skill in place with a dangling dispatch is the worst of both.
**Must not touch:** `.claude/docs/` except this SPEC.
**Acceptance:** the census from U1.2 is green with the nine retiring names still present on
disk. That is the point: references are gone before definitions are.
**Green on merge:** nothing references a name that is about to disappear.

### U7.1 — Delete the nine retired agents

**Deliverable:** remove `codebase-analyst`, `data-engineer`, `debugger`, `devops-engineer`,
`mechanical-editor`, `performance-engineer`, `report-writer`, `solution-architect`,
`verification-strategist`.
**Depends on:** U6.2.
**Acceptance:** the census is green with all nine absent, and `git grep` for each name
returns only `.claude/docs/` historical hits and test fixtures. Inertness: restore one
reference, the census turns RED.
**Green on merge:** every reference was removed in the previous wave, proven by a check that
ran before the files went.

## 6a. Two decisions escalated — both now resolved

**1. The preload tax — RATIFIED 2026-08-17 as decision 0503.** No longer open. Skills at or
under 4 KB are preloaded through `skills:`. Anything larger is a single generated line in the
agent's body naming the procedure's absolute path, read on demand.

Delivery per agent, with sizes in bytes:

| Agent | Preloaded (≤4 KB) | Body pointer (>4 KB) |
|---|---|---|
| delivery-lead | `verification-discipline` 1,853 | `mitosis` 14,200 |
| architect | — | `superpowers:writing-plans` 7,053 |
| investigator | — | `superpowers:systematic-debugging` 9,465 |
| researcher | `context7-mcp` 2,693 | — |
| implementer | `context7-mcp` 2,693 | — |
| test-engineer | — | `superpowers:test-driven-development` 9,015 |
| platform-engineer | authored at U2.1, ≤4 KB required | — |
| release-engineer | `pr` 1,364 | — |
| code-reviewer | — | `superpowers:receiving-code-review` 6,203 |
| security-reviewer | — | `superpowers:receiving-code-review` 6,203 |
| conformance-auditor | authored at U2.2, ≤4 KB required | — |
| verifier | — | `receipts:gates` 16,132 |
| technical-writer | — | `visual-explainer:visual-explainer` 6,743 |

Eight agents take a pointer, five take a preload, delivery-lead takes both. Removed from
unconditional per-dispatch inlining: 75,014 bytes across the eight.

**The version-path problem, and its resolution — this is binding on U1.3.** Plugin paths
embed a version segment (`.../superpowers/6.3.0/...`), so a hand-written pointer breaks at the
next plugin update. Pointers are therefore **resolved at generation time from
`installed_plugins.json`**, never hand-written, and the drift check fails when a generated
body's path no longer matches the currently resolved one. A plugin upgrade becomes a failing
check instead of a silent breakage.

The resolution logic already exists in this repository and is reused, not rebuilt:
`.claude/lib/mitosis/superpowers-prompts.mjs` reads the current entry from the manifest and
falls back to a semver-descending glob over the plugin cache.

**2. "Four backup profiles" — STRUCK from c4 on 2026-08-17 as decision 0508.** An exhaustive
search of the repo, every decision on this thread, the audit explainer, every session log and
`~/.claude/backups/` found no definition. The closest candidate was three dated snapshot
directories, none containing a roster backup — so it was neither four, nor profiles, nor
roster-related.

It had to go rather than sit harmlessly. A completion criterion is a definition of done, and
an item nobody can identify can neither be satisfied nor shown not to apply. Its presence
alone made c4 unclosable however well the rebuild went, which is a worse failure than
omitting it.

**"405 worktree copies" was corrected in the same rewrite**, because preserving a number known
to be false while editing that exact sentence would be a deliberate defect. Measured: 18
worktrees carrying 15 roster files each, 270 copies. The 405 figure was never computed in any
surviving artifact.

c4 now reads: *"Agent and observer teardown and rebuild executed without breaking the live
coupling surface: rules and skills naming agents by string, 18 worktrees carrying roster
copies, derived residuals."* The genuine coupling surface — agent names in rules and skills —
survives untouched and is fully inventoried in U6.2.

## 6b. Carried risk: R13

Decision 0501 carries R13 as a named risk rather than a blocker, and requires this SPEC to
state a decided mitigation.

**The risk.** Measured skill-trigger reliability is 50–55% without a hook backstop. An agent
that must *choose* to invoke a skill may not.

**Its actual scope, after this round's evidence.** Only the four Leads. The nine executing
agents hold no `Skill` tool and receive their procedure unconditionally by preload, so no
trigger decision exists for them. R13 originally read as a risk to the whole router design;
it is a risk to one band.

**Decided mitigation.** Leads preload their load-bearing procedures through `skills:` and use
`Skill`-tool invocation only for genuinely discretionary ones. Anything a Lead must always do
arrives unconditionally; anything it might sometimes do is chosen. This routes every critical
path around trigger reliability at the cost of the preloaded body alone.

**Effect of decision 0503, now ratified.** The mitigation as originally worded said "preload
the load-bearing procedures". Under 0503 a Lead's load-bearing procedure is a body pointer
instead, because all four Leads' procedures exceed 4 KB. That makes the mitigation *stronger*,
not weaker: the body is the binding channel, while a preloaded skill arrives on the advisory
one carrying the "may or may not be relevant" hedge. The instruction to fetch the procedure
now outranks the procedure's own former delivery.

**How it will be known to have failed.** A Lead completing a unit of work without having read
the procedure its duty names. This is observable in the rebuilt observer once U3.3 lands —
`tool_calls` on the Lead's own row, joined to the procedure path — and is the first standing
query to run after the roster is live. That is a detection, not a prevention, and is recorded
as such.

## 7. Out of scope

- Restoring the bash gate's `ask` verdict. Rejected in decision 0495; the deny list is the
  whole control and the residual is an accepted risk.
- Cutting the standing instruction load for volume alone. The question is re-scoping with
  path globs. The binary trace confirmed rules are the eager per-dispatch cost while skills
  are lazy, which changes what a cut would even target.
- Converting the round-4 report's diagrams to inline SVG, and redacting the codename it
  carries. Both ratified as the validator's known baseline.
- The `protect-claude-config.sh` claim in the b6 spec. That hook was deleted in `c8a1b9a7`
  and is a second removed control in the self-modification domain; it belongs to the thread
  already open on that exposure, not here.
