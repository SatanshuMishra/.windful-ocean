---
name: report
description: Use when the user runs /report or asks to generate/write up/make/produce a report (and near-equivalents). Produces a teaching-oriented, cited report — a self-contained HTML file for substantial subjects or inline markdown for trivial ones. Owns the report standards and orchestrates researcher (verification) → report-writer (content) → visual-explainer (render); computes the per-project save path and appends the report index. On-demand only; no auto-hooks.
---

# Report

Produce a teaching-oriented, cited report for a near-novice reader. This skill is the single owner of the report standards and the orchestrator of the flow: it dispatches `researcher` to verify every external claim, dispatches `report-writer` (Opus) to structure the verified findings, invokes `visual-explainer` to render HTML, and then computes the save path and appends the index. Three seams, one responsibility each (spec P1): the skill owns standards and placement; the writer owns content; visual-explainer owns rendering. The trust boundary is enforced by tool scope, not intent (spec P2) — only this skill delegates, so no weaker second research path can exist. Compose the existing research infra rather than copy it (spec P3); stay coherent with the ledger's per-project, topic-slug layout (spec P4); teach a near-novice throughout (spec P5). Source of truth for all standard prose: `docs/superpowers/specs/2026-06-30-report-system-design.md`.

## Orchestration flow

The skill runs in the main loop (which has Task + Skill), so it sequences the whole flow (spec "Architecture and orchestration flow"):

1. **Parse the request** → resolve `topic`, `type`, `format`, `track` (resolution rules in §Invocation).
2. **Gather + verify (trust boundary).** Split the report into claim-clusters; dispatch `researcher` per cluster, reusing the existing bounded token-budget ladder (hard cap ≤6 from `research.md`). The researcher runs its full loop (disconfirm, triangulate ≥2, quote-ground, confidence-tag) and returns cited findings. THIS IS THE ONLY verification path.
3. **Write.** Dispatch `report-writer` (Opus) with the verified findings + the selected track template + the standards. It structures the content for a near-novice reader, grounds in-repo references with `path:line` citations, and never re-derives a claim. It RETURNS structured content — a markdown body (inline path) or render-ready structured content (HTML path); it never verifies, renders, or places.
4. **Freshness re-check.** Before render, re-check load-bearing external links; a failure flags `[stale]` and re-dispatches that single claim to `researcher`, then the writer updates it.
5. **Render (HTML path only).** Invoke `visual-explainer:visual-explainer` (Skill tool) to produce ONE self-contained HTML file from the structured content, per §Render.
6. **Place + index.** Compute the destination path deterministically (§Filesystem), write/move the file there, and append one row to `reports/INDEX.md` (§Index). Path logic and index maintenance live in ONE place — this skill — never in the agent.

```
report SKILL (orchestrator, delegates)
  -> researcher x N   (verifies; the trust boundary; returns cited findings)
  -> report-writer    (Opus; structures verified findings; never verifies, never renders)
  -> visual-explainer (renders HTML; minimal overrides)   [HTML path only]
  -> skill            (computes path, places file, appends INDEX.md)
```

## Invocation

`/report <subject or instruction>` with optional flags; also triggered by natural language — "generate a report", "write up a report", "make a report on…", "produce a report" and near-variants. On-demand only; no auto-hooks.

Resolution (all inferable, all overridable — the skill never blocks on a decision it can compute; spec Component 5):

- **topic** — `--topic <slug>` if given; else the active ledger thread's slug when one is `active` this session; else a slug derived from the subject.
- **type** — `--type research|decision|diagnostic|general` if given; else inferred from the request ("research X" → research; "why did X break / diagnose" → diagnostic; "record the decision" → decision; otherwise general).
- **format** — `--inline` (markdown returned in chat) or `--html` (self-contained file) if given; else inferred from substance (trivial → inline markdown; substantial → HTML).
- **track** — inferred from subject/context (a mitosis-pipeline report vs a research report vs the General fallback); selects the template under `templates/`. Performance + Security sections are mandatory regardless of track.

Examples:
- `/report why the e2e halted at execute/slug` → diagnostic, topic from active thread, HTML if substantial.
- `generate a report on report-organization options` → research track, General/derived topic.
- `/report --inline --type decision the save-path choice` → trivial markdown decision note.

## Writing standard

BLUF (answer first) + a plain-language confidence badge. Assume the reader knows little: define every specialist term in plain words on first use; use analogies; no walls of text. Prose only for nuance — everything comparative, relational, or quantitative becomes a table, diagram, or callout (spec Component 3 Writing standard, P5).

## Trust standard

Compose the repo research infra; never reinvent a weaker verification path (spec Component 3 Trust standard — six gaps closed, no rule fork):

1. **Delegation path** — skill-level dispatch of `researcher` happens before the writer runs; the writer's prompt says "you consume, you do not verify". The writer has no `Task`/`WebSearch`, so this is structural, not a convention.
2. **In-repo citations** — a `path:line` citation form complements `research-citations.md`'s URL form; confirmed at claim time via Read/Grep; unpinnable → `[unverified]`; never fabricate a path or line.
3. **Render-time freshness** — a final-mile re-check of load-bearing links (flow step 4); failure → `[stale]` + single-claim re-dispatch to `researcher`.
4. **Reader-facing confidence** — one plain-language badge legend, defined once at the top of each report (not the agent-handoff `[High — 3 sources]` form).
5. **Statistics rule** — the Admission Gate below.
6. **Cluster budget** — claim-clusters map onto the existing ≤6 ladder from `research.md`, so a report cannot become an unbounded swarm.

## Statistics Admission Gate

A number may appear only if ALL FOUR hold and are disclosed inline; any one fails → omit it (never soften into a vague phrase that still implies the figure) (spec Component 3):

- **Sourced** to a specific checkable artifact (paper, official benchmark, primary doc, or in-repo measurement) — not a paraphrase.
- **Methodology inline** — what was measured, on what sample/environment, how, and when. A number with no stated environment is inadmissible regardless of prestige.
- **Contradiction checked** — a search for a rival figure was run and disclosed; no independent second source → `[unverified · single source]`; a vendor on its own product is one interested source.
- **Relevance shown** — the source's context matches the claim (a microbenchmark cannot license a "faster in production" claim).

## Color standard

No fixed, brand, or default colors (spec Component 3 Color standard). Before assigning a color, name in one phrase the single categorical dimension it encodes; if you cannot name it, keep it neutral grey (`#999999`). One diagram encodes at most one categorical dimension by color; the palette holds as many colors as that dimension has categories. Assign POSITIONALLY from the Okabe-Ito colorblind-safe palette by category order:

- 1st → `#E69F00` (orange)
- 2nd → `#009E73` (bluish-green)
- 3rd → `#56B4E9` (sky-blue)
- 4th → `#D55E00` (vermillion)
- 5th → `#CC79A7` (reddish-purple)
- max-visibility → `#F0E442` (yellow)
- uncategorised / structure → `#999999` (grey)

On the dark diagram canvas drop black and reserve mid-blue (`#0072B2`) for fills, not small text. A legend alone does not satisfy WCAG 1.4.1, but the requirement is met for free when a node's own text names its category; only color-only elements (bare borders, connector lines, icon-only nodes) need an extra shape or text cue. Dark-background contrast ratios are self-computed — one spot-check of mid-blue small text before shipping.

## Visual standard

Visuals complement and integrate into the narrative; never a detached "diagrams" section (spec Component 3 Visual standard). No node-count limit; do not force fit-to-content; viewport overflow is acceptable — optimize for usefulness, not size.

## Mandatory sections

Every report, every track, carries both (spec decision 5 + Component 3):

- **Performance** — what this changes about cost (time/tokens/memory); "nothing measurable, and here is why" is a valid, required answer.
- **Security** — what this exposes; same honesty rule.

## Filesystem

Topic-first directories of flat, date+type-stamped files, beside the ledger, with a curated index (spec Component 4). Path template (verbatim):

```
<root>/reports/<topic-slug>/YYYY-MM-DD-<type>-<title-slug>.<ext>
<root>/reports/INDEX.md
```

- **`<root>` selection (mirrors the ledger locate logic):** git repo → `<repo>/.claude`; else → `~/.claude/projects/<project-slug>`. For THIS project (global config, non-git) the non-git root applies: `~/.claude/projects/-Users-satanshumishra--claude`.
- **`<topic-slug>`** — reuse the corresponding ledger `threads/<slug>.md` slug when the report belongs to an existing thread (one shared identifier space for reports and threads, P4); else a freshly slugified topic string.
- **`<type>`** — one of `research | decision | diagnostic | general`; a filename token, NOT a directory level (keeps a line of work in one folder rather than fragmenting across up to four type folders).
- **`<title-slug>`** — slugified human title.
- **`<ext>`** — `html` (substantial) or `md` (trivial), per format resolution.
- **Collision rule** (mechanical, no human judgment) — compute the path; if a file already exists there, append `-2`, `-3`, … before the extension. No cross-write shared counter, so no merge-collision risk.

## Index

`reports/INDEX.md`, sibling to the topic folders (spec Component 4 Index):

- Grouped by topic — one `##` per topic-slug, newest-first within it; each row `Date | Type | Title | Path`. Grouping mirrors the physical layout so it reads as a table of contents; `type` stays a filterable column so "all decisions across topics" is answerable without a type-first layout.
- The skill APPENDS one row immediately after writing the report file — decision-time capture, formatted mechanically from metadata already in hand (no LLM judgment).
- Browse-on-demand, never auto-loaded into session context; therefore NEVER cap-pruned — it stays a searchable table at 500+ rows (unlike `PROJECT.md`, which is capped because it loads every session).

## Render

HTML path only. Mirror `skills/explain-my-config/SKILL.md:37-49`: invoke the visual-explainer skill (Skill tool: `visual-explainer:visual-explainer`, v0.8.1 — reuse, no fork) to produce ONE self-contained HTML file from the writer's structured content (spec Component 7). Direct it to:

- Author Mermaid nodes with SHORT, `<br/>`-wrapped labels; use `dagre` layout for small diagrams (eliminates the round-1/2 clipping, which was an authoring/config problem, not a tool defect).
- Render Mermaid `look: 'handDrawn'`. Render tables as real `<table>` elements.
- Apply color per §Color standard ONLY where a categorical dimension is named; everything else neutral grey.
- Keep the zoom/fit config; do NOT force fit-to-content (viewport overflow is acceptable).

Then write the file to the computed path (§Filesystem) and append its index row (§Index).

## Constraints

- Honors no-comments in every rendered artifact and script (markdown report prose is content, not a comment; shebang/pragma carve-outs only). No emojis. No AI co-author attribution.
- Three-pillars ordering: Quality > Optimization > Speed; never trade a higher pillar for a lower.
- On-demand only; no auto-hooks.
- The writer never verifies and never places — enforced structurally by its tool scope (no `Task`, no `WebSearch`), not by instruction alone.
