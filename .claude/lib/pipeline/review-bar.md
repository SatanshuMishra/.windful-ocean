# Review bar

This file fixes, before any review starts, how a finding is rated and when it blocks. It holds for a project of any kind and size. Every reviewer and validator brief names it, and a finding is judged only against it, the spec and its decisions file.

## Severity

- CRITICAL: data loss or corruption, a secret or credential exposed, an irreversible outward action the project denies made reachable (a merge, a deploy, a publish or a push to a protected branch), or a security boundary the spec or the project names broken, each with a working demonstration.
- HIGH: an acceptance criterion or requirement of the spec that fails, behaviour the change adds or touches that is wrong for an ordinary input on its main path, or a vulnerability the change introduces that lets someone read, change or run what they should not, with a working demonstration.
- MEDIUM: behaviour that is wrong for an edge input the spec names or a user plausibly gives, or a security need the spec states that is weakened, either with a reproduction.
- LOW: everything else, including hardening beyond what the spec asks, style, naming, maintainability, test strength, performance with no stated budget, a weakness the base already had, and anything not reproduced.

## What blocks

A new finding blocks only when the validator confirms all three of these tests.

1. Bar: the finding breaks an acceptance criterion, a requirement, a boundary or a non-goal of the spec, a need in the spec's Review bar section when the spec has one, or a project rule quoted word for word with its path, or it is a vulnerability the Severity section's HIGH item names; a CRITICAL finding passes this test.
2. Introduced: applied in this order: a finding fails this test as a repeat only when it describes the same defect as a carried blocker the validator marks open, or as a candidate numbered before it in the candidates file that the validator confirms, and that earlier item's severity is the same as or higher than its own; a repeat of a rejected candidate, of a fixed carried blocker or of an item of lower severity is judged on its own; otherwise a CRITICAL finding, a NOT MET acceptance criterion and an unmet requirement of the spec pass it; otherwise it passes when the base does not have it in round 1, and from round 2 when the round's fix commits introduced it.
3. Reproduced: a command that fails or an input that demonstrates the problem, which the validator runs or gives itself and sums up on one line with what it showed.

From round 2, the validator also checks each confirmed blocker of the previous round, carried into the candidates file, and marks it open or fixed.

Everything else is advisory: it goes to the final report and the pull request's comment, never to a fix round.

## What a reviewer reports

A finding already in an earlier round's findings file is not reported again; the validator re-checks earlier blockers.

Every finding is rated with the Severity section, and the validator decides with What blocks whether it blocks.

A kind listed in the do-not-flag file is not reported unless it is CRITICAL or breaks an acceptance criterion or requirement of the spec.

A secret or credential is never quoted: name the file and line that hold it.

A finding that describes a vulnerability, a weakness someone could exploit, or a secret or credential is a security finding, whoever reports it, and the pull request's comment never shows its text.

## Kinds

A kind is a short lowercase name for a defect class, such as `hidden text`. The validator gives every finding it confirms or rejects a kind, and it reuses a kind already in the ledger when one fits, so one defect class keeps one name across rounds and runs. A candidate rejected as a repeat takes the kind of the item it repeats.
