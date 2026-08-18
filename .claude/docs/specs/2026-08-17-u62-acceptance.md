# U6.2 acceptance criterion — repoint the rules and skills

Declared before implementation, per SPEC section 5 and receipts/gates@1.1 G0. This is a
CEILING. Anything discovered above it is filed as a new item, never folded in.

This document REPLACES the acceptance line printed at U6.2 in
`2026-08-17-agent-roster-rebuild.md`. That line is withdrawn for the reason recorded in
section 1.

Parent commit: the head of U6.1, not yet cut. The RED baseline in section 3 was measured on
`main` at `54fd9d20`, where U6.1's engine literal is also still in place, so the true parent
set is the measured set minus that one engine site.

## 1. Why the previous acceptance was withdrawn

It read: *"the census from U1.2 is green with the nine retiring names still present on disk."*

**Defect 1 — the criterion has no failing state.** The U1.2 census resolves in one direction
only: every referenced name must resolve to a definition that exists on disk
(`name-integrity-census.mjs:317`, `ok: buckets.dangling.length === 0`). Nothing iterates the
roster to ask whether a definition is still referenced. At U6.2's parent commit all nine
retiring definitions still exist, so every reference to them reads as `resolved` both before
the unit and after it. The criterion is satisfied by doing nothing, and U7.1 would then delete
the definitions and leave dangling routing instructions behind.

**Defect 2 — the instrument is mostly blind.** Decision 0532 recorded that the census grammar
reads a code span whose very next word is the role noun. Measured against the live repository,
the grammar detects **5 of 19** real reference sites across the nine retiring names — 26%. The
census self-attests this in `name-integrity-census.mjs:12`. The blindness is broader than 0532
recorded: bold emphasis (`**debugger**`) is not a code span at all, a comma-separated list
captures only its final item, and a parenthesis or any intervening word breaks the match.

The two defects compound. A criterion that cannot fail, measured by an instrument that cannot
see, is the exact failure mode SPEC section 4 names three times over.

## 2. The instrument, and why it needs no grammar

The retiring set is **nine known literal strings**. A census over a known token set requires no
inference, so it has nothing to be blind to. This unit therefore does NOT widen the U1.2
grammar; it adds a separate, grammar-free retirement census. The general grammar gap is filed
in section 7, above this ceiling.

**Scope:** `.claude/rules/`, `.claude/skills/`, `.claude/lib/`, recursive. `.claude/docs/` is
out of scope and stays out. Directories named `tests` and `prompt-snapshots` are excluded, as
they already are in U1.2.

**The retiring set is DERIVED, never typed into the check.** Two independent derivations must
agree, and disagreement HALTS rather than picking one — decision 0511's shape applied to the
roster itself:

| # | Derivation |
|---|---|
| A | the canonical agent directory per U1.1, minus the thirteen of SPEC section 5b |
| B | the nine named explicitly at SPEC section 5b, "Deleted in the contract wave" |

If A and B do not yield the same nine names, the census exits non-zero naming the symmetric
difference. It never proceeds on one derivation alone.

A third assertion closes the classification: every agent on disk belongs to exactly one of
the thirteen or the nine, and every one of the nine is on disk. An agent in neither set, or
in both, HALTS. This holds at every point in the wave sequence and is what lets the census
run before wave 4 as well as after it — 6 + 9 = 15 today, 13 + 9 = 22 after wave 5, 13 + 0
after U7.1.

Derivation B is deliberately NOT "agents lacking a generator spec". That reads as the more
independent test, but it is unrunnable before wave 5 regenerates the thirteen: on `main` no
agent has a generator spec, so it would yield all fifteen, disagree with A, and halt the
census at exactly the moment it is most needed.

**The bar is ZERO occurrences**, not "zero routing occurrences." There is no
descriptive-versus-routing classification, deliberately: a classification step is a place to
relabel an inconvenient site rather than fix it, and every site measured in section 3 is prose
that becomes false the moment the definition is deleted. A site that genuinely must survive is
a ladder downgrade recorded per site, never a silent carve-out.

**Per-name coverage is REPORTED, always.** The census prints a site count for each of the nine,
including the zeros. Three names — `data-engineer`, `devops-engineer`, `performance-engineer` —
have no references anywhere in scope, and a check that silently omits them is
indistinguishable from a check that did not look. This is decision 0536's shape: report
coverage, never claim disuse.

## 3. A check RED on the parent commit and GREEN on the head

    node .claude/lib/mitosis/mitosis-gate.mjs retirement-census

RED at the parent. Measured on `main` at `54fd9d20`: **19 (name, line) pairs across 18 distinct
file:line sites**. U6.2 owns 17 of the 18; `decompose-emit.mjs:16` belongs to U6.1 and is
expected to be already green at U6.2's true parent.

| Name | Sites |
|---|---|
| codebase-analyst | `decompose-emit.mjs:16` (U6.1), `tool-routing.md:30`, `tool-routing.md:32` |
| debugger | `tool-routing.md:30`, `performance.md:52` |
| mechanical-editor | `plan-to-task-graph/SKILL.md:20`, `explain-my-config/references/pipeline-narrative.md:21` |
| report-writer | `delegation-discipline.md:33`, `report/SKILL.md:3`, `:8`, `:16`, `:24` |
| solution-architect | `git-workflow.md:13` |
| verification-strategist | `verification-discipline/SKILL.md:13`, `:14`, `:23`, `verify-setup/SKILL.md:8`, `:38`, `explain-my-config/references/pipeline-narrative.md:28` |
| data-engineer | none |
| devops-engineer | none |
| performance-engineer | none |

These counts are the RECORDED BASELINE, not an asserted constant. The pass condition is zero.
A pinned count would be a change-detector wearing a census costume.

GREEN on the head: zero occurrences, with the per-name report showing all nine at zero.

## 4. Six sites the SPEC's deliverable list does not name

The enumeration printed at U6.2 was verified site by site: all eight of its entries are still
present at their stated lines, no drift. It is nonetheless INCOMPLETE. These six are real and
unlisted:

| # | Site | Name |
|---|---|---|
| 1 | `.claude/skills/explain-my-config/references/pipeline-narrative.md:21` | mechanical-editor |
| 2 | `.claude/skills/explain-my-config/references/pipeline-narrative.md:28` | verification-strategist |
| 3 | `.claude/skills/report/SKILL.md:3` | report-writer (frontmatter description) |
| 4 | `.claude/skills/report/SKILL.md:8` | report-writer |
| 5 | `.claude/skills/report/SKILL.md:24` | report-writer (flow diagram) |
| 6 | `.claude/lib/mitosis/decompose-emit.mjs:16` | codebase-analyst (U6.1 owns this one) |

`explain-my-config` is named nowhere in U6.2's deliverable list, so both of its sites would
have survived the unit and been deleted out from under by U7.1.

**The census is the authority, not the list.** The list is informative and is corrected in the
SPEC in the same change as this document. A future divergence between the two is resolved by
re-running the census, never by trusting the prose.

## 5. Inertness mutations

Each applied to a COPY in a temp directory. The runner never mutates its inputs. Every
substitution is verified to have actually changed the file before the result is trusted.

| # | Mutation | Expected |
|---|---|---|
| 1 | restore any one repointed reference to its retiring name | RED, naming that exact file:line |
| 2 | drop one name from derivation A | HALT naming the symmetric difference, never a silent pass |
| 3 | point the scan at an empty directory | non-zero exit, never green |
| 4 | reduce the scan to the U1.2 code-span grammar | RED: 13 of the 18 sites become invisible |

Mutation 4 is the one that pins defect 2. A census that survives it has inherited the blindness
it was written to remove.

## 6. No-collateral assertion

Asserted by diff. This unit must not touch:

- `.claude/agents/**` — byte-identical to the parent. This unit adds, modifies and deletes no
  agent definition; those belong to U4, U5 and U7.
- `.claude/lib/mitosis/decompose-emit.mjs` — U6.1 owns the engine literal.
- `.claude/docs/**` except the roster-rebuild SPEC and this file.
- `name-integrity-census.mjs`'s existing grammar and its `CENSUS_NOT_ATTESTED` disclosure. The
  self-attested limitation at `:12` remains TRUE after this unit and must not be deleted.

## 7. Filed above the ceiling, not built here

- **U6.2a — widen the U1.2 census grammar.** This unit removes U6.2's dependence on the grammar
  but does not repair it. It still detects 26% of prose references and will under-report the
  next rename. Filed against U1.2's instrument, not folded in here.
- **U7.1's acceptance inherits defect 2.** It reads "the census is green with all nine absent",
  and that census sees 5 of 19 sites. U7.1 must re-run THIS census, not the U1.2 one. Amended in
  the SPEC in the same change.
- **U6.1's inertness is future-conditioned.** It reads "the census reports codebase-analyst as
  referenced-but-absent once U7.1 lands", which cannot be run at U6.1 time. The retirement
  census makes it runnable immediately. Amended in the SPEC in the same change.
- **U5.1's first clause has defect 1.** "The census proves every existing reference to all five
  still resolves" is green before and after, because all five keep their names. Its other two
  clauses (drift check, preload resolution) are falsifiable and carry the unit. Noted, not
  rewritten.

## 8. The `report` skill is already decided

U6.2's note says "decide explicitly". It is stale — decision 0481 withdrew the `report` skill
from the architecture, ruling that its references to a report-writer agent "stop mattering
rather than needing to be repointed".

Four of the eighteen sites are inside `.claude/skills/report/`. Deleting the skill directory
discharges all four. If it is retained instead, all four must be repointed. The census proves
either path; it does not care which is chosen, only that zero occurrences remain.
