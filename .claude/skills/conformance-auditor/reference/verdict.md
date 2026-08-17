# Writing the audit output

An audit returns findings and statuses. It returns no edits, no new rules, and no request
for another round.

## A finding is a citation plus an observation

Every finding carries six fields. A finding missing the authority field is not a finding;
it is a proposal, and it goes to `reference/proposals.md`.

| Field | Content |
|---|---|
| authority | the gate id (G0 through G17) or the rule file path that this violates |
| observed | what is actually there, quoted or shown |
| location | path and line, confirmed at the time you write it |
| why | the sentence of the cited mandate that the observation contradicts |
| disposition | blocking, filed, or above-ceiling |
| confidence | what you checked, and what you could not |

Never fabricate a location. If you cannot pin the observation to a path and line, say so in
the location field and mark the confidence accordingly.

## Three dispositions, and only three

**blocking** - the change breaks a gate the enforcer runs and the enforcer blocked on it.
That verdict already exists; your finding explains it, it does not create it.

**filed** - the change breaks a named gate or rule that no enforcer check covers, or breaks
nothing and is a genuine concern. It is recorded as an item and the work ships. A finding
that breaks no gate is advisory by construction: the enforcer is the gate, and a re-review
round is not a substitute for an executable check.

**above-ceiling** - the observation is real and is outside the acceptance criterion the unit
declared before it started. It is filed as a NEW item. It never fails the unit, it never
reopens a unit that already met its criterion, and it is never folded into the work in hand.
Treating an acceptance list as a floor makes done unsatisfiable, and work against an
unsatisfiable criterion cannot terminate.

When you are unsure whether a finding is inside or above the ceiling, re-read the declared
criterion rather than reasoning from what the change touches. The criterion decides.

## Status, from the ladder

Each audited item gets exactly one status, and the vocabulary is closed:

| Status | Means |
|---|---|
| fixed | the symptom was reproduced and is observably gone on the build that carries the commit |
| unverified-reasoned | a real root cause and a test exercising the fixed path, but the symptom could not be observed in this environment; ships with the reason stated and routed to whoever can observe it |
| speculative | no confirmed root cause; never silent, and never without explicit human sign-off on money, auth, contracts or destructive migrations |
| reverted | the change was backed out |

This applies to your own claims too. Where you could not clear a gate in the audit - no
access to the deployed build, no way to drive the reporter's screen, a coverage command that
does not exist - the outcome is `unverified-reasoned` with the reason named. It is never a
silent pass, and it is never another review round.

"I could not verify this" is a first-class outcome. A false claim of `fixed` is not.

## The aggregate tally

Count downgrade reasons across the run, keyed on reason and surface class rather than on
the raw count. Twenty downgrades across unrelated surfaces for unrelated reasons is a hard
week. Twenty carrying one reason on one surface class is an entire class of work with no
verification path, and someone downstream is silently doing that job by hand.

Where one reason recurs past the configured threshold, name the missing capability in the
run summary. Surface it; do not stall on it. Blocking an honest downgrade only converts it
into a claim of `fixed`, which is the failure the ladder exists to prevent.

Escalate to the human for the aggregate capability gap, not for individual gate failures.

## Two things the verdict never contains

**A new mandate.** Not a check to add, not a census to build, not a rule the project should
adopt, not a lesson promoted to policy. Those are proposals and they have their own file.

**Another round.** An unclearable gate produces a status from the ladder above. A finding
that breaks no gate produces a filed item. Neither produces a request to review again.

## Shape

Return the findings and statuses as structured output where the dispatch provides a schema.
Where it does not, lead with the verdict - met the declared criterion, or did not, and the
status - then the findings grouped by disposition, then the tally. Blocking first, filed
second, above-ceiling last, so the reader reaches the actionable half before the backlog.
