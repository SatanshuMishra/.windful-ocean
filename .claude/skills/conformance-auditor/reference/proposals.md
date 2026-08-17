# A gap the standard does not cover

This is the file for the moment your audit finds something real that no gate and no rule
names. It has exactly one permitted outcome: a proposal, filed, addressed to the owner of
the standard. It has one forbidden outcome, and that outcome is the characteristic failure
of this role.

## The forbidden outcome

You may never promote a finding, a review verdict, or a post-mortem lesson into a
project-local verification mandate. Not as a rule file, not as a line added to a rule file,
not as a new check, census, probe, control or parity module, not as an acceptance criterion
appended to a unit already in flight, and not as a paragraph in a report that later reads
as policy.

This is not a style preference. A mandate invented mid-run has no version, no owner and no
scope limit, and it binds work that was already estimated against a different bar. The
standard is versioned, external and owned by the user precisely so that the bar cannot move
underneath work in progress - including by an auditor acting in good faith.

The symptom, stated so you can catch yourself: **a repository accumulating its own census,
probe, control or parity modules whose purpose is to verify other verification code.**
Every such construct is a hand-rolled reimplementation of a gate that already exists as a
bounded, machine-run check, and it is unbounded where the gate is capped.

## The test that separates a finding from a proposal

Can you cite a gate id or a rule file path whose stated mandate this observation
contradicts?

- **Yes** - it is a finding. Write it per `reference/verdict.md` with that citation.
- **No** - it is a proposal. Nothing in the audit output may present it as a requirement,
  and no file may be created to enforce it.

There is no third branch. "It is obviously required even though nothing says so" is the
proposal branch wearing the finding's clothes.

Before concluding the standard is silent, look again. The commonest error in this role is
proposing something the standard already covers under a name you did not search for. An
inertness mutation is G14. A check that shields a wide diff is G13. A rule expressed twice
that will drift is G15. A fix that removed the detector is G12. A count of sites changed
where a residual-zero query was needed is G6. Cite the gate rather than authoring its twin.

## Worked rewrites

**A recurring defect shape.** You notice three defects this quarter share one shape: a check
that could not fail.
- Wrong: adopt a project rule that every new check ships with a proof that it can fail.
- Right: that proof is the inertness mutation the acceptance shape already requires, and the
  mutation referee is G14. Cite them. The defect is that the existing requirement was not
  applied, which is a finding, not a gap.

**Doubt about an enforcer result.** You want confidence that the enforcer's static scan
really covered the diff.
- Wrong: build a module that re-scans the diff and compares against the enforcer's output.
- Right: read the verdict. A second implementation of the same check is a second error
  source, and disagreement between them will look like signal when it is noise. If the
  enforcer's coverage is genuinely in doubt, that is a proposal against the enforcer.

**A unit that met its bar.** The unit satisfied the criterion it declared, and you can see
three further improvements.
- Wrong: report it as not done until the three are addressed.
- Right: above-ceiling, filed as three new items. The unit passed.

**A rule you believe the project should have.** The diff does something you would not have
done, and no rule forbids it.
- Wrong: write the rule, or write the finding as though the rule existed.
- Right: a proposal. The project's rule set is the user's, and an agent that edits it has
  changed what binds every future session without anyone deciding to.

## How to write the proposal

Five fields, and keep it to that:

1. **The gap**, in one sentence, stated as what goes unnoticed today.
2. **The scar** - a real instance you observed, with its location. Not a hypothetical. A
   proposal with no instance behind it is speculation, and the gate set is scar tissue.
3. **Which gate it extends**, or why it is genuinely new. Say which you searched.
4. **The enforcement kind** it would need: executable, hybrid, or agent-judgment. A proposal
   that can only ever be agent-judgment is worth less than one a machine can re-run, and
   saying so honestly is part of the proposal.
5. **What to do meanwhile** - the ladder status the affected work ships under until the gap
   is closed. Work does not stop waiting for a proposal.

File it and keep shipping. A proposal is a request to the owner of the standard, not a
blocker, and not a reason to open another review round.

## This file included

Nothing here is a mandate either. It is the procedure for handling a gap. If you find that
this procedure itself has a gap, the response is the same: propose it, do not legislate it.
