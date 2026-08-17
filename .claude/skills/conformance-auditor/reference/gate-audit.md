# Auditing a change against the gates

The standard is `receipts/gates@1.1`. Eighteen gates, G0 through G17, plus the honesty
ladder. The spec is at `~/.claude/plugins/marketplaces/receipts/spec/GATES.md`; the receipt
formats are its siblings `RECEIPT.md`, `LIVE-RECEIPT.md` and `WORK-TYPES.md`.

Read the spec. Do not audit from recall. A gate's mandate is the text in that file, not
your memory of it, and quoting a mandate you did not re-read is the same defect you are
auditing for.

The same standard has a fix-time half, carried by the `receipts:gates` skill, which drives
an agent through the gates while it is making the change. This procedure is the after-the-
fact half: it judges what that agent produced. Where the two disagree about what a gate
requires, the spec file settles it - neither skill is the standard.

## Step 1 - establish the ceiling before reading the diff

Find the acceptance criterion the unit declared before work started (G0). It is normally in
the SPEC's per-unit section, the plan, or the dispatch brief.

That criterion is the complete definition of done. You are auditing whether the change met
it, not whether the change is everything it could have been. A change that met its declared
criterion passes even where you can see three further improvements; those are new items.

If no criterion was pinned before the work, that is itself the G0 finding, and it is the
one finding that is worth more than everything below it. Record it and continue.

## Step 2 - read the enforcer's verdict, never re-derive it

Eight gates are re-run by the receipts enforcer at the pull request: G6, G7, G8, G9, G10,
G11, G13, G14. The enforcer is the gate. Your job on these is to READ its verdict and its
receipt artifact, and to notice what the verdict does not cover.

Re-running an executable gate yourself does not multiply confidence. It adds a second
independent error source, and then makes disagreement look like signal. Reserve your own
execution for the one case where the enforcer reports a FAILURE whose meaning is unclear,
and then run the enforcer's own reported command, not an audit of its other claims.

What to read, per executable gate:

| Gate | Read | The thing the verdict does not tell you |
|---|---|---|
| G6 | declared families and the twin heuristic output | whether a multi-language rollout had a declared family at all |
| G7 | new-dependents test run | dependents reached through DI, FFI, SQL or codegen, which no import scan sees |
| G8 | base-is-ancestor assertion | whether the recon that produced the diagnosis ran from the tip |
| G9 | full suite on head, exit-masking rejection | whether the suite claims a shared mutable resource another run can reseed |
| G10 | structural breaking-diff on contract files | whether a new route was ever registered, which no unit test on either side traverses |
| G11 | deleted, skipped, focused tests; snapshot churn | assertions loosened in place, which no static scan detects |
| G13 | coverage intersected with the diff | nothing, if no coverage command is configured; then the gate did not run |
| G14 | surviving mutants | a string-shaped symptom with no mutable operator on its changed lines |

A gate configured to warn rather than block produced a warning, not a pass. A gate that did
not run produced nothing at all, and nothing is not a green.

## Step 3 - audit the judgment gates, which is where your work actually is

Five gates have no PR-side artifact and are carried entirely by the agent that did the
work: G2, G4, G5, G15, G16. Three more are hybrid and leave their harder half to judgment:
G0, G1, G3. This is the model-dependent surface of the standard, and it is why this audit
exists as a separate duty rather than as a line in the enforcer.

- **G0** - was the symptom observed and recorded BEFORE the fix was chosen? A reproduction
  written after the fix is a description of the fix.
- **G1** - is the assertion on the value the consumer perceives, at the far end of the path,
  on the node that paints it? A read taken on a container, a wrapper, an attribute mirroring
  the value, or a middle layer is honest about the wrong quantity.
- **G2** - was the reporter's exact flow AND runtime context pinned: role, tenant, flag
  bucket, locale, device? Reproducing as an admin a bug that only bites a regular user is
  the canonical miss.
- **G3** - was the deployed sha OBSERVED on the running artifact? A merge that returned
  MERGED and a green CI run say nothing about whether the deploy rolled.
- **G4** - after deploying, was the reporter's actual screen driven? If the change is not
  visible there, the wrong surface was fixed.
- **G5** - was the flow driven to its terminal action, accepting pre-filled defaults rather
  than re-typing them? The state seams between steps are where fixed-one-broke-another lives.
- **G15** - does the change create two representations of one fact with no check that fails
  on divergence? The test: change one copy; if nothing anywhere goes red, this gate applies.
- **G16** - what happens to instances that already exist, and specifically to the one named
  in the report? Self-heals with a named trigger, backfilled with a count, or immutable with
  a reason. Disclosure satisfies this gate; silence does not.

## Step 4 - interrogate the receipt

The receipt is the reported symptom's own acceptance test, re-run against the real build,
coming back clean. Ask the spec's own falsification question and answer it in writing:

> What is a way the reported symptom is STILL present while this test passes?

If you can name one, the receipt asserts a proxy. Name the stand-in and the node or layer
the assertion should move to.

Four receipt defects to check for by name:

1. **Absence rather than presence.** "The error no longer appears" passes for a fix that
   silenced the detector. Require the positive invariant: the value arrived, the action
   succeeded for the right principal.
2. **Not red on the parent.** A receipt that was never red proves nothing. The enforcer
   re-runs it on base; confirm the red is a genuine failure and not a load or collection
   error, which is not a red.
3. **No teeth.** An assertion of the form "not the old value" goes green for any change at
   all. Pinned exact values only.
4. **Narrower than the claim.** A receipt flipping on three of five hundred changed lines
   verifies three lines. The other four hundred and ninety-seven are unverified changes and
   are named as such.

## Step 5 - audit the claim, not only the code

Every verification line in the pull request body asserts that a named check was run and its
result read. Cross-read each against what was actually run. A line describing a check that
was not run, or whose output was never read, is a fabricated assurance, and it is worse
than an absent one because a reviewer trusts it by default.

The correct forms for the two honest cases are the not-verified variants: a check that was
not run, and a check whose result is unknown. Both are acceptable. A fabricated Verified
line is not.

## Step 6 - hand the result to the verdict procedure

Findings, classification, disposition and status are written per `reference/verdict.md`.
A gap the standard does not cover goes to `reference/proposals.md` and nowhere else.
