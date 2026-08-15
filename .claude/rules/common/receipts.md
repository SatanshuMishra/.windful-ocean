# Receipts Gates (the sole verification standard, every project)

Verification is governed by ONE external, versioned, closed standard: `receipts/gates@1.1`, spec at `~/.claude/plugins/marketplaces/receipts/spec/GATES.md`. Eighteen gates, G0 through G17, plus the honesty ladder.

## The closed-set rule (CRITICAL)

The gate set is external to every project and owned by the user. An agent may PROPOSE a gap; an agent may NEVER promote a finding, a review verdict, or a post-mortem lesson into a project-local verification mandate.

This is not a style preference. A project-local mandate invented mid-run has no version, no owner, and no scope limit, and it binds work that was already estimated against a different bar. Where a real gap exists, file it against the standard and keep shipping under the ladder.

Symptom to watch for: a repository accumulating its own census, probe, control, or parity modules whose purpose is to verify other verification code. Every such construct is a hand-rolled reimplementation of a gate that already exists as a bounded, machine-run check, and it is unbounded where the gate is capped.

## Acceptance is a CEILING

G0 requires the acceptance criterion to be pinned observably BEFORE the work starts. That declared criterion is the complete definition of done for that unit of work.

Anything discovered above it is filed as a NEW item. It is never folded into the work in hand, and it never reopens a unit that already met its criterion. Treating an acceptance list as a floor makes "done" unsatisfiable, and work against an unsatisfiable criterion cannot terminate.

## The ladder is the escape, not another round

A gate that cannot be cleared produces a tracked status, never a further review cycle and never a silent pass: `fixed`, `unverified-reasoned`, `speculative`, `reverted`. "I could not verify this" is a first-class outcome; a false `fixed` is not.

G17 counts downgrade reasons across a run and surfaces a named capability gap when one recurs. It surfaces, it does not stall — blocking an honest downgrade only incentivizes claiming `fixed` instead.

This is what keeps work autonomous. Escalate to the human for the aggregate capability gap, not for individual gate failures.

## The enforcer is the gate; review is advisory

Eight gates are re-run by the enforcer at the pull request (G6, G7, G8, G9, G10, G11, G13, G14). A reviewer finding that breaks no gate is filed, not fixed in flight. Re-review rounds are not a substitute for an executable check.

## Per-project wiring

Every repository Claude opens pull requests in carries both halves:

1. `.github/workflows/receipts.yml` invoking `shaheershoaib/receipts/enforcer`. Template: `.claude/skills/mitosis/templates/receipts.yml`.
2. `receipts.config.json` at the repository root, tuned to that project.

No `receipts` CLI ships with the plugin — `receipts init` and `receipts doctor` are specified in `enforcer/INIT.md` but unimplemented, so the config is authored by hand against the keys the enforcer actually reads. Detection signals per key are tabulated in that same file.

Settings that must be explicit, because their defaults leave real gaps:

| Key | Default | Required | Why |
|---|---|---|---|
| `claim.require_receipt_for` | fix-claims only | `any-source-change` | A feature PR with no issue link is otherwise never asked for a receipt |
| `claim.downgrade_tags` | unset | the four ladder tags | Without them the ladder is unavailable and agents open another round instead |
| `gates.G14.mode` | warn | `block` | The mutation referee; bounded at `max_mutants`, default 12 |
| `gates.G11.mode` | warn | `block` | Deleted, skipped, or focused tests are the canonical agent reward-hack |
| `gates.G13.coverage_command` | unset | set per stack | Unset means G13 does not run at all, and a narrow receipt shields a wide diff |
| `verify.on_load_error_red` | unset | set | An import or collection error is not a genuine red, and counting it as one invalidates the receipt |
| `verify.receipt_runs` | 1 | raise where flakes are live | A flaky receipt manufactures a fake red or passes a broken fix |
| `gates.G6.surfaces` | heuristic only | declare families | A glob plus a required marker encodes an app-wide claim as a re-checkable invariant |
| `agent.loop_skills` | unset | register the project's loop | The trajectory store is only useful if something queries it at start and appends at close-out |

`build.sha_source` and `build.platform` stay `none` for a library or CLI with no deploy; that correctly disables G3.

## Precedence

This rule governs verification. It supersedes any project-local verification mandate, decision record, orchestrator brief, or ruling that predates it, including any that declares an acceptance list a floor. `testing.md` continues to govern which tests are admitted; this file governs what proves a change works.
