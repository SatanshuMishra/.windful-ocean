# Report System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated, reusable report system — a `report` skill that owns the standards and orchestrates, a `report-writer` agent (Opus) that writes verified content, and the research-infra edits that decouple research from mandatory reporting — all authored as files the human installs into `~/.claude`.

**Architecture:** Three seams, one responsibility each (spec P1): the `report` skill orchestrates the six-step flow and owns every standard; the `report-writer` agent consumes the researcher's verified findings and returns structured content (never verifies, never renders, never places); `visual-explainer` renders HTML with minimal overrides. The trust boundary is enforced by tool scope (the writer has no `Task`/`WebSearch`), so no weaker second research path can exist (spec P2).

**Tech Stack:** Markdown skill/agent/rule files under `~/.claude`; `visual-explainer:visual-explainer` v0.8.1 for HTML render; the existing `researcher` agent + `research.md` + `research-citations.md` for the verification path.

**Source spec:** `docs/superpowers/specs/2026-06-30-report-system-design.md` (APPROVED 2026-06-30). Every task cites the spec Component it implements; the spec is the co-located source of truth for prose. Read the cited Component before authoring.

## Global Constraints

- **Non-git project.** `~/.claude` is NOT a git repository. NO `git add`/`git commit`/`git` steps anywhere in this plan. Each file Write/Edit trips the `protect-claude-config` PreToolUse hook, which returns "ask"; the human approves each write — this approval IS "install" (DoD #8). The agent never applies anything to a live system.
- **Verification model (per rules/common/testing.md, which supersedes the writing-plans TDD template).** Skill/agent/rule/template markdown are configuration/docs and are test-exempt. Per-task verification = structural checks (file exists; required sections/values present via grep; forbidden text absent). The ONE behavioral acceptance is Task 6 (the DoD #6 worked-report end-to-end run). No pytest/RED-GREEN cycles.
- **No code comments** in any rendered HTML or script (shebang/pragma carve-outs only). Markdown prose is report content, not a comment. **No emojis** anywhere. **No AI co-author attribution.**
- **Never edit vendored plugin files** (`plugins/cache/...`). Reuse `visual-explainer` via the Skill tool; no fork.
- **Three Pillars:** Quality > Optimization > Speed; never trade a higher pillar for a lower.
- **Model tiering:** `report-writer` = Opus (spec decision 9). Agents are stateless — NO `memory:` field.
- **Pinned versions:** `visual-explainer:visual-explainer` v0.8.1; never `@latest`.
- **Color values (verbatim, spec Component 3 color standard):** positional Okabe-Ito by category order — 1st `#E69F00`, 2nd `#009E73`, 3rd `#56B4E9`, 4th `#D55E00`, 5th `#CC79A7`, max-visibility `#F0E442`, uncategorised/structure `#999999`. Dark-canvas: drop black; reserve mid-blue (`#0072B2`) for fills, not small text.
- **Path root selection (git vs non-git), mirrors the ledger locate logic:** git repo → `<repo>/.claude/reports/...`; else → `~/.claude/projects/<project-slug>/reports/...`. For THIS project (global config, non-git) the non-git path applies: `~/.claude/projects/-Users-satanshumishra--claude/reports/`.

---

## File Structure

- `agents/report-writer.md` — NEW. The Opus content agent. One responsibility: structure verified findings into a near-novice report body. (Task 1)
- `skills/report/templates/technology-decision.md` — NEW. Track template seeded from `researcher.md:38-46`. (Task 2)
- `skills/report/templates/bug-diagnostic.md` — NEW. Track template seeded from `researcher.md:48-56`. (Task 2)
- `skills/report/templates/general.md` — NEW. General fallback template. (Task 2)
- `skills/report/SKILL.md` — NEW. The orchestrator: owns all standards, runs the six-step flow, computes the path, appends `INDEX.md`. References the agent (Task 1) and templates (Task 2). (Task 3)
- `rules/common/research.md` — MODIFY. Un-mandate report-on-research (Output contract). (Task 4)
- `agents/researcher.md` — MODIFY. Decouple output contract from visual-explainer; remove the two archetypes (now homed in templates). (Task 4)
- `rules/common/research-citations.md` — MODIFY. Add the `path:line` in-repo citation form. (Task 4)
- `CLAUDE.md` — MODIFY. Update the research pointer line to match the un-mandate. (Task 4)
- `projects/-Users-satanshumishra--claude/reports/report-system/` + `.../reports/INDEX.md` — NEW (migration target). (Task 5)

Decomposition note: the per-track templates are separate files under `skills/report/templates/` (file-organization: many small files; matches the `mitosis` skill's `templates/` precedent) so `SKILL.md` stays focused on orchestration + standards.

Dependency order: Task 1 (agent) and Task 2 (templates) are independent and could run in parallel. Task 3 (skill) references both. Task 4 (research-infra) depends on Task 2 (archetypes must be homed in templates before removal from `researcher.md`). Task 5 (migration) depends on Task 3 (path scheme + INDEX design). Task 6 (worked report) depends on 1+2+3+4.

---

### Task 1: `report-writer` agent

**Files:**
- Create: `agents/report-writer.md`

**Interfaces:**
- Consumes: the researcher's verified, cited findings; a selected track template (Task 2); the report standards (Task 3).
- Produces: an agent named `report-writer`, model `opus`, tools `Read, Write, Grep, Glob, WebFetch` (NO `WebSearch`, NO `Task`), invoked ONLY by the `report` skill. Returns structured content (markdown body for inline; render-ready structured content for HTML). Never verifies, renders, or places the file.

- [ ] **Step 1: Read the spec's agent contract**

Read `docs/superpowers/specs/2026-06-30-report-system-design.md` Component 2 (`report-writer` agent) and the trust standard in Component 3. Cross-check the tool scope against `agents/technical-writer.md` (the roster this mirrors) and confirm no existing agent carries `Task` (`researcher.md:4`).

- [ ] **Step 2: Author `agents/report-writer.md`**

Write exactly this content:

```markdown
---
name: report-writer
description: Report content specialist, dispatched only by the report skill. Consumes the researcher's verified, cited findings and structures them for a near-novice reader against a selected track template; grounds in-repo claims with path:line; applies the Statistics Admission Gate, the color standard, and mandatory Performance + Security sections. Returns structured content only — never verifies, never renders HTML, never places or indexes the final file.
tools: Read, Write, Grep, Glob, WebFetch
model: opus
---

You turn already-verified research findings into a structured, near-novice-readable report. You do NOT verify claims (the researcher already did that), you do NOT render HTML (visual-explainer does), and you do NOT place or index the final file (the report skill does).

## Lane
A content specialist dispatched only by the `report` skill. You consume verified findings and produce structured content. You cannot self-dispatch or run fresh web research — you have no `Task` and no `WebSearch`, by design. That tool scope is the trust boundary: there is no weaker second research path.

## Inputs (from the skill)
- The researcher's verified, cited findings — the ONLY source of external claims.
- The selected track template (technology-decision, bug-diagnostic, or general).
- The report standards (writing, color, Statistics Admission Gate, mandatory sections).

## Writing standard
BLUF (answer first) plus a plain-language confidence badge. Assume the reader knows little: define every specialist term in plain words on first use; use analogies; no walls of text. Prose only for nuance — everything comparative, relational, or quantitative becomes a table, diagram, or callout.

## Grounding
Ground in-repo claims with a `path:line` citation confirmed via Read/Grep at claim time; if you cannot pin the reference to a location, mark it `[unverified]`. Never fabricate a path or line. Never re-derive or re-verify a researcher finding.

## Statistics Admission Gate (all four hold, disclosed inline, or omit the number)
A number appears only if it is: Sourced to a specific checkable artifact (not a paraphrase); Methodology-disclosed inline (what was measured, on what sample/environment, how, when); Contradiction-checked (a rival figure was searched and disclosed; no independent second source → `[unverified · single source]`; a vendor on its own product is one interested source); Relevance-shown (the source context matches the claim). Any one fails → omit it; never soften into a vague phrase that still implies the figure.

## Color standard
No fixed/brand/default colors. Before assigning a color, name the one categorical dimension it encodes; if you cannot name it, keep it neutral grey (`#999999`). One diagram encodes at most one categorical dimension by color. Assign positionally from Okabe-Ito by category order: 1st `#E69F00`, 2nd `#009E73`, 3rd `#56B4E9`, 4th `#D55E00`, 5th `#CC79A7`, max-visibility `#F0E442`, uncategorised/structure `#999999`. On the dark diagram canvas drop black and reserve mid-blue (`#0072B2`) for fills, not small text. Where an element is color-only (bare border, connector line, icon-only node) add a shape or text cue; a node whose own text names its category already satisfies this.

## Mandatory sections (every report, every track)
- Performance — what this changes about cost (time/tokens/memory); "nothing measurable, and here is why" is a valid, required answer.
- Security — what this exposes; same honesty rule.

## Output
Return structured content only. Inline path → a markdown body. HTML path → render-ready structured content: sections, real tables, and diagram specs whose Mermaid node labels are SHORT and `<br/>`-wrapped. Never emit final HTML, never write into the reports/ tree, never append INDEX.md — the skill owns path computation and placement.

## Do NOT
- Verify or re-verify a claim; run web research; self-dispatch.
- Render HTML, or place/index the final artifact.
- Write code comments or emojis; add AI attribution.
```

- [ ] **Step 3: Verify structure**

Run: `test -f ~/.claude/agents/report-writer.md && grep -E '^model: opus$' ~/.claude/agents/report-writer.md && grep -E '^tools: Read, Write, Grep, Glob, WebFetch$' ~/.claude/agents/report-writer.md && ! grep -q 'WebSearch\|Task\|memory:' ~/.claude/agents/report-writer.md && echo OK`
Expected: `OK` (Opus model, correct tool scope, no WebSearch/Task/memory).

- [ ] **Step 4: Verify the mandatory content is present**

Run: `grep -c 'Statistics Admission Gate\|Performance\|Security\|path:line\|Okabe-Ito\|near-novice' ~/.claude/agents/report-writer.md`
Expected: a non-zero count covering all listed anchors (Statistics Gate, Performance, Security, path:line grounding, color palette, near-novice writing). Read the file and confirm each is present exactly once in its section.

---

### Task 2: report track templates

**Files:**
- Create: `skills/report/templates/technology-decision.md`
- Create: `skills/report/templates/bug-diagnostic.md`
- Create: `skills/report/templates/general.md`

**Interfaces:**
- Consumes: the two archetypes currently at `researcher.md:38-46` and `:48-56` (moved here per spec decision 2 + Component 3).
- Produces: three section-structure templates. EVERY template contains mandatory `Performance` and `Security` sections. Referenced by name from `SKILL.md` (Task 3) and by the removal edit in Task 4.

- [ ] **Step 1: Read the spec's template definitions**

Read `docs/superpowers/specs/2026-06-30-report-system-design.md` Component 3 (Tracks and templates). Confirm the two seed archetypes match `researcher.md:38-56` verbatim before moving them.

- [ ] **Step 2: Author `skills/report/templates/technology-decision.md`**

```markdown
# Technology-decision report template

Section order below is required. Performance and Security are MANDATORY in every track.

- TL;DR — recommendation + a plain-language confidence badge.
- Why it matters.
- Domain primer — every specialist term defined in plain words on first use.
- Approaches considered.
- Comparison & trade-offs — rendered as a real table (matrix).
- Recommendation & rationale — including the runner-up and why it lost.
- Performance — cost impact (time/tokens/memory); "nothing measurable, and here is why" is valid.
- Security — what this exposes; same honesty rule.
- Risks & unknowns.
- Sources.
```

- [ ] **Step 3: Author `skills/report/templates/bug-diagnostic.md`**

```markdown
# Bug / diagnostic report template

Section order below is required. Performance and Security are MANDATORY in every track.

- TL;DR — root cause in one sentence + the fix + blast radius.
- Observable symptom.
- Minimal system context — only the few components that matter, never a file inventory.
- Root cause as a causal chain.
- Why it is a problem.
- Recommended fix + rejected alternatives — resolves the cause, not the symptom.
- Performance — cost impact of the fix.
- Security — what the bug or the fix exposes.
- Risks + how to verify.
```

- [ ] **Step 4: Author `skills/report/templates/general.md`**

```markdown
# General report template (fallback)

Used when no specific track matches. Performance and Security are MANDATORY.

- TL;DR + a plain-language confidence badge.
- Context — why it matters.
- Body — organized for the subject; every specialist term defined on first use; comparative/relational/quantitative content rendered as tables, diagrams, or callouts, never walls of text.
- Performance — cost impact (time/tokens/memory).
- Security — what this exposes.
- Risks / open questions.
- Sources.
```

- [ ] **Step 5: Verify all three templates carry the mandatory sections**

Run: `for f in technology-decision bug-diagnostic general; do grep -q '^- Performance' ~/.claude/skills/report/templates/$f.md && grep -q '^- Security' ~/.claude/skills/report/templates/$f.md && echo "$f OK" || echo "$f MISSING"; done`
Expected: `technology-decision OK`, `bug-diagnostic OK`, `general OK`.

---

### Task 3: the `report` skill

**Files:**
- Create: `skills/report/SKILL.md`

**Interfaces:**
- Consumes: `report-writer` (Task 1), the three templates (Task 2), `researcher` (existing), `visual-explainer:visual-explainer` v0.8.1 (existing).
- Produces: the on-demand `report` skill (`/report` + NL triggers) that owns the standards, runs the six-step flow, computes the destination path deterministically, and appends `reports/INDEX.md`. It is the ONLY component that dispatches agents or invokes visual-explainer.

- [ ] **Step 1: Read the spec + the pattern to mirror**

Read `docs/superpowers/specs/2026-06-30-report-system-design.md` Components 1, 3, 4, 5, 7 and the "Architecture and orchestration flow" section. Read `skills/explain-my-config/SKILL.md:37-51` (the Render + Deliver steps) — the report skill's render step mirrors this visual-explainer invocation precisely.

- [ ] **Step 2: Author `skills/report/SKILL.md`**

Author the file with the exact frontmatter and section structure below. Fill each standard section by adapting the corresponding spec Component prose (cited per section) — do not invent standards; the spec is the source of truth. Use the verbatim hard values from this plan's Global Constraints (color hexes, path template, Statistics Gate conditions).

Frontmatter (verbatim):

```markdown
---
name: report
description: Use when the user runs /report or asks to generate/write up/make/produce a report (and near-equivalents). Produces a teaching-oriented, cited report — a self-contained HTML file for substantial subjects or inline markdown for trivial ones. Owns the report standards and orchestrates researcher (verification) → report-writer (content) → visual-explainer (render); computes the per-project save path and appends the report index. On-demand only; no auto-hooks.
---
```

Required sections (each `##`), with content source:

1. `# Report` + one-paragraph purpose (spec Context + P1-P5).
2. `## Orchestration flow` — the SIX steps verbatim in intent (spec "Architecture and orchestration flow"):
   1. Parse the request → resolve `topic`, `type`, `format`, `track` (rules in §Invocation).
   2. Gather + verify — split into claim-clusters; dispatch `researcher` per cluster on the existing token-budget ladder (hard cap ≤6 from `research.md`); the researcher runs its full loop and returns cited findings. THIS IS THE ONLY verification path.
   3. Write — dispatch `report-writer` (Opus) with the verified findings + selected template + standards; it returns structured content; it never verifies/renders/places.
   4. Freshness re-check — before render, re-check load-bearing external links; a failure flags `[stale]` and re-dispatches that single claim to `researcher`, then the writer updates it.
   5. Render (HTML path only) — invoke `visual-explainer:visual-explainer` (Skill tool) per §Render.
   6. Place + index — compute the destination path deterministically, write/move the file there, append one row to `reports/INDEX.md`.
3. `## Invocation` — `/report <subject>` + NL triggers; resolution for `topic` / `type` / `format` / `track`, all inferable + overridable, skill never blocks on a computable decision (spec Component 5, verbatim resolution rules incl. the three examples).
4. `## Writing standard` (spec Component 3 Writing standard — P5/BLUF).
5. `## Trust standard` (spec Component 3 Trust standard — six gaps closed: delegation path, in-repo `path:line` citations, render-time freshness, reader-facing confidence badge legend, the Statistics rule, cluster budget ≤6).
6. `## Statistics Admission Gate` — the four conditions verbatim (Sourced / Methodology inline / Contradiction checked / Relevance shown), default-to-omit.
7. `## Color standard` — verbatim Okabe-Ito positional palette (hexes from Global Constraints), one categorical dimension per diagram, name-the-dimension-or-grey, dark-canvas mid-blue-for-fills rule, WCAG 1.4.1 text-names-category note, self-computed-contrast spot-check.
8. `## Visual standard` (spec Component 3 Visual standard — visuals integrate into the narrative; no node-count limit; do not force fit-to-content; overflow acceptable).
9. `## Mandatory sections` — Performance + Security in EVERY report regardless of track (spec decision 5 + Component 3).
10. `## Filesystem` — the path template, `<type>` token set (`research | decision | diagnostic | general`, a filename token not a directory level), git/non-git root selection (Global Constraints), and the collision rule (append `-2`, `-3`, … before the extension). Verbatim path template:
    ```
    <root>/reports/<topic-slug>/YYYY-MM-DD-<type>-<title-slug>.<ext>
    <root>/reports/INDEX.md
    ```
    `<topic-slug>`: reuse the active ledger `threads/<slug>.md` slug when the report belongs to a thread; else a freshly slugified topic string.
11. `## Index` — `reports/INDEX.md` grouped by topic (`##` per topic-slug, newest-first), each row `Date | Type | Title | Path`; the skill APPENDS one row immediately after writing the file (decision-time capture, mechanical from metadata); browse-on-demand, never auto-loaded, never cap-pruned (spec Component 4 Index).
12. `## Render` — mirror `explain-my-config` SKILL.md:37-49: invoke `visual-explainer:visual-explainer` (Skill tool) to produce ONE self-contained HTML file from the writer's structured content; direct it to author Mermaid nodes with SHORT `<br/>`-wrapped labels, use `dagre` layout for small diagrams, render Mermaid `look: 'handDrawn'`, render tables as real `<table>` elements, apply color ONLY where a dimension is named, keep zoom/fit config but do NOT force fit-to-content. Write to the computed path (§Filesystem). Reuse v0.8.1; no fork (spec Component 7).
13. `## Constraints` — honors no-comments in every rendered artifact/script; three-pillars ordering (Quality > Optimization > Speed); on-demand only, no auto-hooks; the writer (not the skill) never verifies is enforced by the writer's tool scope.

- [ ] **Step 3: Verify the skill scaffold and required anchors**

Run: `test -f ~/.claude/skills/report/SKILL.md && grep -q '^name: report$' ~/.claude/skills/report/SKILL.md && echo OK`
Expected: `OK`.

Run: `grep -o -E 'Orchestration flow|Statistics Admission Gate|Color standard|Filesystem|Index|Render|Invocation|Mandatory sections' ~/.claude/skills/report/SKILL.md | sort -u`
Expected: all eight anchors listed.

- [ ] **Step 4: Verify the hard values landed verbatim**

Run: `grep -c 'E69F00\|009E73\|56B4E9\|D55E00\|CC79A7\|F0E442\|999999' ~/.claude/skills/report/SKILL.md`
Expected: ≥7 (all Okabe-Ito hexes present).

Run: `grep -q 'INDEX.md' ~/.claude/skills/report/SKILL.md && grep -q 'visual-explainer:visual-explainer' ~/.claude/skills/report/SKILL.md && grep -q '<topic-slug>' ~/.claude/skills/report/SKILL.md && echo OK`
Expected: `OK` (index append, render invocation, path template all present).

---

### Task 4: research-infrastructure edits (decouple report-on-research)

**Files:**
- Modify: `rules/common/research.md` (Output contract)
- Modify: `agents/researcher.md:35-57`
- Modify: `rules/common/research-citations.md`
- Modify: `CLAUDE.md` (research pointer line)

**Interfaces:**
- Consumes: the templates from Task 2 (the archetypes must be homed there before removal here).
- Produces: research that returns report-ready findings on demand (no auto-render); a `path:line` citation form; a `researcher.md` output contract with the archetypes removed.

- [ ] **Step 1: Read the spec's reconciliation**

Read `docs/superpowers/specs/2026-06-30-report-system-design.md` Component 6. Confirm Task 2 templates exist (the archetypes are homed) before removing them from `researcher.md`.

- [ ] **Step 2: `rules/common/research.md` — un-mandate (Output contract)**

In the `## Output contract` section, replace the first bullet. Old:

```
- Every research deliverable is rendered as a report via the `visual-explainer` skill — always. No raw walls of text in chat.
```

New:

```
- Research returns report-ready findings to the orchestrator; a rendered report is produced only on demand via the `report` skill (`/report`). No raw walls of text in chat.
```

Reconcile two dependent bullets in the same section for coherence (the un-mandate is incomplete otherwise). Old bullet 3:

```
- Two archetypes: technology-decision report and bug/diagnostic report (the `researcher` agent carries the section templates).
```

New bullet 3:

```
- Two archetypes seed the report templates: technology-decision and bug/diagnostic (the `report` skill carries the section templates).
```

Old bullet 4:

```
- The report is delivered and approved BEFORE any next step. Research never silently rolls into implementation.
```

New bullet 4:

```
- Research findings are returned to the orchestrator; rendering a report is on-demand, never automatic. Research never silently rolls into implementation.
```

Leave the near-novice bullet and every Objectivity / Citation / loop / Delegation standard untouched.

- [ ] **Step 3: `agents/researcher.md:35-57` — decouple output contract, remove archetypes**

Replace line 36. Old:

```
Return report-ready content; the orchestrator renders it via visual-explainer and presents it before any next step. Assume the reader knows little or nothing about the domain: define every specialist term in plain words on first use, use analogies, and avoid walls of text. Pick the archetype that fits.
```

New:

```
Return report-ready content. Assume the reader knows little or nothing about the domain: define every specialist term in plain words on first use, use analogies, and avoid walls of text. A rendered report is produced separately and on demand via the `report` skill.
```

Delete the two archetype blocks and the closing note — i.e. remove current lines 38-57 in full:

```
New-project / technology decision:
- TL;DR recommendation + confidence.
- Why it matters.
- Domain primer, every term defined.
- Approaches considered.
- Comparison & trade-offs (matrix-ready).
- Recommendation & rationale, including the runner-up and why it lost.
- Risks & unknowns.
- Sources.

Bug / root-cause diagnostic (understanding over file enumeration):
- TL;DR: root cause in one sentence + the fix + blast radius.
- Observable symptom.
- System context: only the few components that matter, not a 50-file inventory.
- Root cause as a causal chain.
- Why it is a problem.
- Recommended fix & why: resolves the cause, not the symptom; alternatives rejected.
- Risks & how to verify.

End every response with a one-line note that the content is report-ready for visual-explainer rendering.
```

Result: the `## Output contract` section is the header + the trimmed line 36 only; the `## Do NOT` section that follows is untouched.

- [ ] **Step 4: `rules/common/research-citations.md` — add the `path:line` form**

Insert immediately after the URL format block line (`> Claim — [source title or domain](https://url).`) a new paragraph:

```
For claims about the project's own code or config (in-repo claims), use a `path:line` citation form alongside the URL form:

> Claim — `path/to/file.ext:line`.

Confirm the path and line at claim time with Read/Grep. If the reference cannot be pinned to a location, mark it `[unverified]`. NEVER fabricate a path or a line number.
```

- [ ] **Step 5: `CLAUDE.md` — update the research pointer line**

Replace the research global-invariant line. Old:

```
- Research follows an always-on standard: delegate to the researcher agent, stay objective/unbiased, verify + cite every claim, never invoke the bundled deep-research workflow, deliver a visual-explainer report before next steps. ~/.claude/rules/common/research.md
```

New:

```
- Research follows an always-on standard: delegate to the researcher agent, stay objective/unbiased, verify + cite every claim, never invoke the bundled deep-research workflow, return report-ready findings (rendered into a report only on demand via the report skill / /report). ~/.claude/rules/common/research.md
```

- [ ] **Step 6: Verify the un-mandate is complete**

Run: `! grep -q 'rendered as a report via the .visual-explainer. skill — always' ~/.claude/rules/common/research.md && grep -q 'only on demand via the .report. skill' ~/.claude/rules/common/research.md && echo research-OK`
Expected: `research-OK`.

Run: `! grep -q 'report-ready for visual-explainer rendering' ~/.claude/agents/researcher.md && ! grep -q 'New-project / technology decision' ~/.claude/agents/researcher.md && echo researcher-OK`
Expected: `researcher-OK` (closing note + archetypes gone).

Run: `grep -q 'path/to/file.ext:line' ~/.claude/rules/common/research-citations.md && ! grep -q 'deliver a visual-explainer report before next steps' ~/.claude/CLAUDE.md && echo edits-OK`
Expected: `edits-OK` (path:line form added, CLAUDE.md pointer updated).

---

### Task 5: migrate the two existing design reports

**Files:**
- Create: `projects/-Users-satanshumishra--claude/reports/report-system/` (directory)
- Move: `docs/reports/report-system-design.html` → `.../reports/report-system/2026-06-30-general-report-system-design-round1.html`
- Move: `docs/reports/report-system-design-round2.html` → `.../reports/report-system/2026-06-30-general-report-system-design-round2.html`
- Create: `projects/-Users-satanshumishra--claude/reports/INDEX.md`

**Interfaces:**
- Consumes: the filesystem scheme + INDEX design from Task 3.
- Produces: the two legacy reports relocated under the new per-project topic-first scheme (spec DoD #7), and the seed `INDEX.md`.

- [ ] **Step 1: Confirm the source files and the round dates**

Read the two files' headers to confirm identity and pick honest `YYYY-MM-DD` stamps (both round-1 and round-2 landed 2026-06-30 per the ledger; if a file's own metadata shows an earlier date, use that). Topic-slug = `report-system` (reuses the ledger thread-slug per P4). Type token = `general` (design reports).

- [ ] **Step 2: Create the target directory and move the files**

Run:
```bash
mkdir -p ~/.claude/projects/-Users-satanshumishra--claude/reports/report-system
mv ~/.claude/docs/reports/report-system-design.html ~/.claude/projects/-Users-satanshumishra--claude/reports/report-system/2026-06-30-general-report-system-design-round1.html
mv ~/.claude/docs/reports/report-system-design-round2.html ~/.claude/projects/-Users-satanshumishra--claude/reports/report-system/2026-06-30-general-report-system-design-round2.html
```
(If a differently-named html exists under `docs/reports/`, list the dir first with `ls ~/.claude/docs/reports/` and map by content.)

- [ ] **Step 3: Author the seed `INDEX.md`**

Create `projects/-Users-satanshumishra--claude/reports/INDEX.md`:

```markdown
# Reports Index

## report-system
Date | Type | Title | Path
--- | --- | --- | ---
2026-06-30 | general | Report system design (round 2) | report-system/2026-06-30-general-report-system-design-round2.html
2026-06-30 | general | Report system design (round 1) | report-system/2026-06-30-general-report-system-design-round1.html
```

- [ ] **Step 4: Verify the migration**

Run: `ls ~/.claude/projects/-Users-satanshumishra--claude/reports/report-system/*.html | wc -l` → expect `2`.
Run: `test ! -e ~/.claude/docs/reports/report-system-design.html && test ! -e ~/.claude/docs/reports/report-system-design-round2.html && echo moved-OK` → expect `moved-OK`.
Run: `grep -c '| general |' ~/.claude/projects/-Users-satanshumishra--claude/reports/INDEX.md` → expect `2`.

- [ ] **Step 5: Update ledger pointers that referenced the old paths**

The `report-system` thread and `PROJECT.md` reference `docs/reports/report-system-design-round2.html`. Update those pointer lines to the new path so the ledger stays truthful (ledger is hints; keep them correct). This is a pointer fix, not payload movement.

---

### Task 6: worked-report end-to-end acceptance (DoD #6)

**Files:**
- Creates (at runtime): one report artifact under `projects/-Users-satanshumishra--claude/reports/<topic>/…` + an appended `INDEX.md` row.

**Interfaces:**
- Consumes: the full system (Tasks 1-4) + the index from Task 5.
- Produces: proof the flow works end-to-end — the single behavioral acceptance of this plan.

- [ ] **Step 1: Pick a real, substantial subject and run the skill**

Invoke the skill on a genuine subject with enough substance to exercise verification and a diagram — e.g. `/report the report-system architecture and its trust boundary`. The skill must: resolve topic (`report-system` from the ledger thread) / type / format (HTML, substantial) / track; dispatch `researcher` for the claim-clusters; dispatch `report-writer`; render via visual-explainer; place the file; append `INDEX.md`.

- [ ] **Step 2: Assert the artifact landed correctly**

Run: `ls ~/.claude/projects/-Users-satanshumishra--claude/reports/report-system/*.html` → the new file is present at `YYYY-MM-DD-<type>-<title-slug>.html`.
Run: `tail -n 5 ~/.claude/projects/-Users-satanshumishra--claude/reports/INDEX.md` → a new row under `## report-system` points at the new file.

- [ ] **Step 3: Manual DoD #6 checklist (read the rendered report)**

Open the HTML and confirm each, fixing the skill/agent/template and re-running if any fails:
- Passes the Statistics Gate: zero unjustified numbers (every figure has source + methodology + contradiction-check + relevance, or is absent).
- Carries a Performance section AND a Security section.
- Uses color ONLY where a categorical dimension is named; everything else neutral grey; Mermaid labels short + `<br/>`-wrapped, no clipping.
- Reads for a near-novice: BLUF, every term defined on first use, no walls of text, comparative content as tables/diagrams.
- One confidence-badge legend defined once at the top.

- [ ] **Step 4: Confirm nothing bypassed the trust boundary**

Verify (by reading the run) that all external claims came through `researcher` (the writer, having no `WebSearch`/`Task`, could not have fetched fresh research). Any claim the writer could not ground is marked `[unverified]` or `[stale]`, not asserted.

---

## Self-Review

Run against the spec's Acceptance Criteria (Definition of Done):

1. DoD #1 (report skill exists, triggers, owns standards, orchestrates, computes path, appends INDEX) → Task 3. ✓
2. DoD #2 (report-writer: Opus, stateless, correct tool scope, consumes-not-verifies, carries templates+standards) → Task 1 (agent) + Task 2 (templates it applies). ✓
3. DoD #3 (archetypes removed from researcher.md, present in the report skill) → Task 4 Step 3 (removal) + Task 2 (homed in templates). ✓
4. DoD #4 (research.md un-mandated, researcher.md decoupled, research-citations.md gains path:line, CLAUDE.md updated) → Task 4 Steps 2/3/4/5. ✓
5. DoD #5 (filesystem scheme: path template, collision rule, git/non-git split, INDEX design + append-at-write) → Task 3 §Filesystem + §Index. ✓
6. DoD #6 (worked report through the full flow: correct path, index row, Statistics Gate, Perf+Security, color-by-dimension, near-novice) → Task 6. ✓
7. DoD #7 (two existing reports migrated) → Task 5. ✓
8. DoD #8 (nothing applied by the agent; files the human installs) → Global Constraints (protect-hook "ask" on every write; non-git, no commits). ✓

Placeholder scan: no TBD/TODO/"add error handling"; every edit gives verbatim old→new text or full file content; prose-heavy standards point to the exact approved spec Component (co-located source of truth) rather than duplicating 300 lines that would drift. Type consistency: template filenames (`technology-decision`, `bug-diagnostic`, `general`) and the `<type>` token set (`research | decision | diagnostic | general`) are used identically across Tasks 2, 3, 5; agent name `report-writer` and skill name `report` consistent throughout.
