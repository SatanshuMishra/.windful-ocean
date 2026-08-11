# Report System — Final Spec

Status: approved for planning (user approved the round-3 architecture and item-2 save-path on 2026-06-30; "accept item 2's path and write the spec"). Nothing in this spec is applied to `~/.claude`: every change is authored here and pasted/installed by the human (the config tree is write-protected). Next step after user review of this spec is the `writing-plans` skill.

## Context

Today there is no dedicated owner for generated reports. Research is hard-wired to always emit a visual-explainer report, report-shaping templates are stranded on the `researcher` agent, and one-off report requests are handed to a generic agent with no consistent standard. This spec defines a dedicated, reusable **report system** — a `report` skill that owns the standards and orchestrates, a `report-writer` agent that writes the content, and a small set of edits to the existing research infrastructure that the report system composes rather than re-implements.

The system TEACHES: plain language for a near-novice reader, no walls of text, why-this / why-not / performance / security in every report, every external claim adversarially verified and cited, and visuals that integrate into the narrative.

Canonical sources this spec is derived from:
- `docs/reports/report-system-design-round2.html` — the round-2 follow-up report (8 sections; the reviewed design surface).
- `docs/reports/report-system-design.html` — the round-1 findings+design report (superseded as review surface).
- Ledger decisions: `decisions/2026-06-30-report-system-direction.md`, `-report-system-clarifications.md`, `-report-system-round3.md`.
- Structural ground truth: `agents/*.md` (no agent carries the `Task` tool, `researcher.md:63` states it), `rules/common/research.md`, `rules/common/research-citations.md`, `rules/common/continuity-ledger.md`, `skills/explain-my-config/SKILL.md` (the skill-orchestrates-visual-explainer pattern), `plugins/.../visual-explainer/0.8.1/`.

## Decisions locked (all rounds)

Architecture:
1. A `report` SKILL owns the standards (per-track templates, writing/visual/color/trust standards, path + index rules) and orchestrates. A `report-writer` AGENT (Opus) gathers-with-verification and writes structured content — never HTML. `visual-explainer` renders HTML with MINIMAL overrides. Rejected: one-skill-no-agent (heavy reading belongs off the main thread); agent-renders-HTML (mixes concerns, bloats context); full fork of visual-explainer (maintenance burden).
2. Report-shaping templates move OFF `researcher` INTO the `report` skill.

Trigger, format, tracks:
3. On-demand trigger only (no auto-hooks). Name locked: `report` skill + `/report` command, plus natural-language triggers ("generate a report", "write up a report", "make a report", near-equivalents).
4. Format: HTML for substantial reports, inline markdown for trivial ones (inferable, overridable).
5. Distinct per-pipeline TRACKS choose the template; a General fallback exists. Performance and Security are NOT tracks — they are mandatory SECTIONS in every report.

Content standards:
6. COLOR: no fixed/brand/default colors. "Name-the-dimension-or-drop-it"; one categorical dimension per diagram; positional assignment from the Okabe-Ito colorblind-safe palette by category order; everything else neutral grey. Opus=orange / Sonnet=green was only a worked example, never a primary.
7. STATISTICS Admission Gate (four conditions, default-to-omit — below).
8. TRUST composes the repo research infra; the report must not reinvent a weaker verification path.
9. Model tiering: Opus does all verification/planning/context-generation; Sonnet only applies a robust plan. Therefore `report-writer` = Opus.
10. Visuals: no node-count limit; do not force fit-to-content; viewport overflow acceptable; optimize for usefulness, not size. Visuals COMPLEMENT and integrate into the narrative, never repeat it as a detached section.

Research-infra reconciliation:
11. UN-MANDATE report-on-research: research no longer auto-produces a report. Edit `research.md` and `researcher.md` to decouple from visual-explainer. Six research-infra gaps + the Statistics Gate are closed WITHOUT forking a rule.

Filesystem:
12. Reports are PER-PROJECT, saved beside the ledger, topic-organized, with a curated index (full scheme below). Reverses the round-2 flat `~/.claude/docs/reports/` proposal.

## Design principles

- P1 — Skill owns standards; agent writes content; visual-explainer renders. Three seams, one responsibility each.
- P2 — Trust boundary is enforced by tool scope, not intent. Only the skill can delegate; the writer cannot self-dispatch or run fresh web research, so a second weaker research path cannot exist.
- P3 — Compose, do not copy. The report system reuses `researcher` + `research.md` + `research-citations.md`; a copied research loop drifts the moment the rule changes.
- P4 — Coherent with the ledger. Report layout, per-project split, topic-slug identity, and decision-time index writes mirror the continuity ledger so the system reads as one design.
- P5 — Teach a near-novice. Define every term on first use; BLUF; prose only for nuance; everything comparative/relational becomes a table/diagram/callout.

## Architecture and orchestration flow

The `report` skill runs in the main loop (which has Task + Skill), so it sequences the whole flow:

1. **Parse the request** → resolve `topic`, `type`, `format`, `track` (resolution rules in the invocation section).
2. **Gather + verify (trust boundary).** Split the report into claim-clusters; dispatch `researcher` per cluster, reusing the existing bounded token-budget ladder (hard cap ≤6 from `research.md`). The researcher runs its full loop (disconfirm, triangulate ≥2, quote-ground, confidence-tag) and returns cited findings. This is the ONLY verification path.
3. **Write.** Dispatch `report-writer` (Opus) with the verified findings + the selected track template + the standards. It structures the content for a near-novice reader, grounds in-repo references with `path:line` citations (confirmed via Read/Grep at claim time; unpinnable → `[unverified]`), and never re-derives a claim. It RETURNS structured content — a markdown body (inline path) or render-ready structured content (HTML path). It does NOT place the final artifact; the skill owns placement (step 6) so path logic lives in one place.
4. **Freshness re-check.** Before render, re-check load-bearing external links; a failure flags `[stale]` and re-dispatches that single claim to `researcher`, then the writer updates it.
5. **Render (HTML only).** Invoke `visual-explainer:visual-explainer` (Skill tool) to produce ONE self-contained HTML file from the structured content, applying the visual standard below.
6. **Place + index.** The skill computes the destination path deterministically, writes/moves the file there, and appends one row to `reports/INDEX.md`. Path logic and index maintenance live in ONE place — the skill — never in the agent.

```
report SKILL (orchestrator, delegates)
  -> researcher x N   (verifies; the trust boundary; returns cited findings)
  -> report-writer    (Opus; structures verified findings; never verifies, never renders)
  -> visual-explainer (renders HTML; minimal overrides)   [HTML path only]
  -> skill            (computes path, places file, appends INDEX.md)
```

## Component 1 — the `report` skill

Location: `~/.claude/skills/report/SKILL.md`.

- **Description / triggers:** fires on `/report`, and on natural-language equivalents — "generate a report", "write up a report", "make a report on…", "produce a report" and near-variants. On-demand only; no auto-hooks.
- **Owns (the standards):** the per-track templates (moved off `researcher`), the writing standard (P5), the visual standard, the color standard, the trust standard (delegation to `researcher`), the Statistics Admission Gate, the mandatory Performance + Security sections, and the filesystem + index rules.
- **Orchestrates:** the six-step flow above. It is the only component that dispatches agents or invokes visual-explainer.
- **Honors** no-comments in every rendered artifact and script, and the three-pillars ordering (Quality > Optimization > Speed).

## Component 2 — the `report-writer` agent

Location: `~/.claude/agents/report-writer.md`. Stateless (no `memory:` field).

- **Model:** Opus (decision 9 — context-generation is Opus work).
- **Tools (scoped like `technical-writer`):** Read, Write, Grep, Glob, WebFetch. Deliberately NO `WebSearch` (fresh web research is the researcher's job) and NO `Task` (cannot self-dispatch). This tool scope is what structurally guarantees the trust boundary (P2).
- **Contract:** consumes the researcher's verified, cited findings and structures them for a near-novice reader against the selected track template. Grounds in-repo claims with `path:line` (Read/Grep-confirmed; unpinnable → `[unverified]`). Applies the Statistics Admission Gate, the color standard, and the mandatory Performance + Security sections. Produces structured content only — never renders HTML, never re-verifies a claim, never places the final artifact (the skill owns path computation and `INDEX.md`). Returns a markdown body (inline path) or render-ready structured content (HTML path). The `Write` tool (per the technical-writer roster) is for intermediate/scratch artifacts, not final placement.

## Component 3 — report artifact standards

### Writing standard
BLUF (answer first) + confidence. Assume the reader knows little: define every specialist term in plain words on first use; use analogies; no walls of text. Prose only for nuance — everything comparative/relational/quantitative becomes a table, diagram, or callout.

### Tracks and templates
The track (e.g. a `/mitosis` report vs a research report vs a General fallback) selects the template. Every template, regardless of track, contains two MANDATORY sections:
- **Performance** — what this changes about cost (time/tokens/memory), even if the honest answer is "nothing measurable, and here is why".
- **Security** — what this exposes, same honesty rule.

The two report archetypes currently on `researcher.md:38-56` move here as the seed templates:
- Technology-decision: TL;DR + confidence → why it matters → domain primer → approaches → comparison matrix → recommendation + runner-up-and-why-it-lost → risks → sources.
- Bug/diagnostic: TL;DR (root cause + fix + blast radius) → observable symptom → minimal system context → root cause as a causal chain → why it's a problem → recommended fix + rejected alternatives → risks + how to verify.

### Trust standard (six gaps closed, no rule fork)
1. **Delegation path** — skill-level dispatch of `researcher` happens before the writer runs; the writer's prompt says "you consume, you do not verify".
2. **In-repo citations** — a `path:line` citation form complements `research-citations.md`'s URL form; confirmed at claim time; unpinnable → `[unverified]`.
3. **Render-time freshness** — a final-mile re-check of load-bearing links; failure → `[stale]` + single-claim re-dispatch.
4. **Reader-facing confidence** — one plain-language badge legend, defined once at the top of each report (not the agent-handoff `[High — 3 sources]` form).
5. **Statistics rule** — the Admission Gate below.
6. **Cluster budget** — claim-clusters map onto the existing ≤6 ladder so a report cannot become an unbounded swarm.

### Statistics Admission Gate
A number may appear only if ALL FOUR hold and are disclosed inline; any one fails → omit it (never soften into a vague phrase that still implies the figure):
- **Sourced** to a specific checkable artifact (paper, official benchmark, primary doc, or in-repo measurement) — not a paraphrase.
- **Methodology inline** — what was measured, on what sample/environment, how, and when. A number with no stated environment is inadmissible regardless of prestige.
- **Contradiction checked** — a search for a rival figure was run and disclosed; no independent second source → `[unverified · single source]`; a vendor on its own product is one interested source.
- **Relevance shown** — the source's context matches the claim (a microbenchmark cannot license a "faster in production" claim).

### Color standard
No fixed/brand/default colors. Before assigning color, name the dimension it encodes in one phrase; if you cannot name it, keep it neutral grey. One diagram encodes at most one categorical dimension by color; the palette holds as many colors as that dimension has categories. Colors are assigned POSITIONALLY from Okabe-Ito by category order (first → `#E69F00` orange, second → `#009E73` bluish-green, third → `#56B4E9` sky-blue, fourth → `#D55E00` vermillion, fifth → `#CC79A7` reddish-purple, "max visibility" → `#F0E442` yellow, uncategorised/structure → `#999999` grey). On the dark diagram canvas drop black and reserve mid-blue for fills, not small text. A legend alone does not satisfy WCAG 1.4.1, but the requirement is met for free when a node's own text names its category; only color-only elements (bare borders, connector lines, icon-only nodes) need an extra shape/label cue. Dark-background contrast ratios are self-computed — one spot-check before shipping.

### Visual standard
Visuals complement and integrate into the narrative; never a detached "diagrams" section. No node-count limit; do not force fit-to-content; viewport overflow is acceptable — optimize for usefulness, not size.

## Component 4 — filesystem organization

Topic-first directories of flat, date+type-stamped files, beside the ledger, with a curated index.

**Path template:**
```
<repo>/.claude/reports/<topic-slug>/YYYY-MM-DD-<type>-<title-slug>.<ext>
<repo>/.claude/reports/INDEX.md
```
- Non-git projects mirror at `~/.claude/projects/<project-slug>/reports/...`, paralleling the ledger's git/non-git split exactly.
- `<topic-slug>`: reuse the corresponding ledger `threads/<slug>.md` slug when the report belongs to an existing thread — one shared identifier space for reports and threads (P4). Fall back to a freshly slugified topic string when no thread matches.
- `<type>`: one of `research | decision | diagnostic | general` — a filename token, NOT a directory level (keeps a line of work in one folder instead of fragmenting it across up to four type folders).
- `<title-slug>`: slugified human title.
- `<ext>`: `html` (substantial) or `md` (trivial), per decision 4.
- **Collision rule** (mechanical, no human judgment): compute the path; if a file already exists there, append `-2`, `-3`, … before the extension. No cross-write shared counter, so no git-merge collision risk.

**Index file:**
- Path `reports/INDEX.md`, sibling to the topic folders.
- Grouped by topic (one `##` per topic-slug, newest-first within it); each row `Date | Type | Title | Path`. Grouping mirrors the physical layout so it reads as a table of contents; `type` stays a filterable column so "all decisions across topics" is answerable without a type-first layout.
- The skill APPENDS one row immediately after writing the report file — decision-time capture, formatted mechanically from metadata already in hand (no LLM judgment).
- Browse-on-demand, never auto-loaded into session context; therefore NOT cap-pruned — it stays a searchable table at 500+ rows (unlike `PROJECT.md`, which is capped because it loads every session).

**Migration:** the two existing design reports currently in `~/.claude/docs/reports/` move under the new scheme to `~/.claude/projects/-Users-satanshumishra--claude/reports/report-system/` (this is a global-config project, so the non-git path applies). Folded into the implementation plan; not done in this spec.

## Component 5 — `/report` invocation shape

`/report <subject or instruction>` with optional flags; also triggered by the natural-language phrasings above.

Resolution (all inferable, all overridable — the skill never blocks on a decision it can compute):
- **topic** — `--topic <slug>` if given; else the active ledger thread's slug when one is `active` this session; else a slug derived from the subject.
- **type** — `--type research|decision|diagnostic|general` if given; else inferred from the request ("research X" → research; "why did X break / diagnose" → diagnostic; "record the decision" → decision; otherwise general).
- **format** — `--inline` (markdown returned in chat) or `--html` (self-contained file) if given; else inferred from substance per decision 4 (trivial → inline markdown; substantial → HTML).
- **track** — inferred from subject/context (e.g. a mitosis-pipeline report vs a research report vs General fallback); selects the template. Performance + Security sections are mandatory regardless of track.

Examples:
- `/report why the e2e halted at execute/slug` → diagnostic, topic from active thread, HTML if substantial.
- `generate a report on report-organization options` → research track, General/derived topic.
- `/report --inline --type decision the save-path choice` → trivial markdown decision note.

## Component 6 — research-infrastructure edits

These make research a standalone act again and back the trust standard, without forking a rule.

- **`rules/common/research.md` → Output contract:** delete "Every research deliverable is rendered as a report via the visual-explainer skill — always. No raw walls of text in chat." Replace with: research returns report-ready findings to the orchestrator; a rendered report is produced only on demand via `/report`. Objectivity, citation, loop, and delegation standards are untouched.
- **`agents/researcher.md`:**
  - Output contract (lines 35-57): drop "the orchestrator renders it via visual-explainer and presents it before any next step" and the closing "End every response with a one-line note that the content is report-ready for visual-explainer rendering." The researcher still returns structured, near-novice-readable, cited findings.
  - Move the two section archetypes (lines 38-56) OUT to the `report` skill's templates (Component 3).
- **`rules/common/research-citations.md`:** add the `path:line` in-repo citation form alongside the URL form (unpinnable → `[unverified]`).
- **`CLAUDE.md`:** update the research.md pointer/summary line to match the un-mandate.

## Component 7 — visual-explainer usage

Reuse `visual-explainer:visual-explainer` (v0.8.1) with MINIMAL overrides (decision — avoid breakage on plugin updates). No template fork. The round-1/2 clipping was an authoring/config problem, not a tool defect:
- Author Mermaid nodes with SHORT, `<br/>`-wrapped labels; use `dagre` layout for small diagrams (the round-2 report already dogfoods this to eliminate clipping).
- Keep the zoom/fit config in the skill's render step; do not force fit-to-content (decision 10).
- Mermaid renders `look: 'handDrawn'`. Tables render as real `<table>` elements. Color per the color standard only where a dimension is named.

## Rejected alternatives

- One-skill-no-agent — heavy verified reading belongs off the main thread.
- Agent-renders-HTML — mixes concerns and bloats agent context; render is visual-explainer's job.
- Full fork of visual-explainer — maintenance burden; the defects are authoring/config, fixable without a fork.
- Flat global `~/.claude/docs/reports/` (round-2 proposal) — not per-project, not topic-organized; reversed by decision 12.
- Date-hierarchy or type-hierarchy report layout — optimize the wrong retrieval axis ("about X" is topic, not date/type) and have no ledger precedent.
- A lighter in-writer verification protocol — structurally impossible AND undesirable; the writer has no `Task`/`WebSearch`, and a copied loop drifts.

## Risks and open items

- **Topic cardinality** — if reports are mostly one-off unique topics, topic folders degenerate to single-entry folders. Mitigation: reuse ledger thread-slugs (which already cluster multi-session work); this project already shows multi-report-per-topic as the norm.
- **Type-as-primary-need** — if "all decisions across topics" becomes the dominant query, topic-first under-serves it. Mitigated by keeping `type` a filterable column in `INDEX.md`.
- **Self-computed contrast** — Okabe-Ito dark-bg ratios are Medium confidence; spot-check `#0072B2`/mid-blue for small text before shipping.
- **Render seam** — the skill→visual-explainer handoff must pass structured content faithfully; mirror `explain-my-config`'s invocation precisely.

## Acceptance criteria (Definition of Done)

1. `skills/report/SKILL.md` exists: on-demand triggers (`/report` + NL), owns the standards, orchestrates the six-step flow, computes the path, appends `INDEX.md`.
2. `agents/report-writer.md` exists: Opus, stateless, tools = Read/Write/Grep/Glob/WebFetch (no WebSearch, no Task), consumes-not-verifies contract, carries the track templates + standards.
3. Report-shaping archetypes removed from `researcher.md`; present in the `report` skill.
4. `research.md` output contract un-mandated; `researcher.md` output contract decoupled from visual-explainer; `research-citations.md` gains the `path:line` form; `CLAUDE.md` pointer updated.
5. Filesystem scheme implemented as specified (path template, collision rule, git/non-git split, `INDEX.md` design + append-at-write).
6. A worked report produced through the full flow lands at the correct path, appends its index row, passes the Statistics Gate (zero unjustified numbers), carries Performance + Security sections, uses color only where a dimension is named, and reads for a near-novice.
7. The two existing `docs/reports/` design reports migrated under the new scheme.
8. Nothing applied to `~/.claude` by the agent; all changes authored as files the human installs.

## Files touched (manifest for the plan)

- New: `skills/report/SKILL.md`, `agents/report-writer.md`, `reports/INDEX.md` (per project, created on first report).
- Edited: `rules/common/research.md`, `agents/researcher.md`, `rules/common/research-citations.md`, `CLAUDE.md`.
- Migrated: `docs/reports/report-system-design*.html` → `projects/-Users-satanshumishra--claude/reports/report-system/`.
