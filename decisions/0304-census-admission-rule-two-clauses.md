---
Status: accepted
Date: 2026-08-09T20:47:18.980Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0304. A closed vocabulary enters the census only if we own the code and production branches on the value, and an exclusion downgrades rather than deletes

## Context

The vocabulary census reports 52 closed vocabularies across 141 tracked source files, and the registry quantifies over none of them. 28 of the 52 are emitted discriminants, a class spanning both extremes: outcome.mjs#kind (shipped, halted, crashed) is branched on downstream and is exactly the defect shape 0301 names, while run-engine.mjs#type (string, array, boolean, object) is a typeof lookup table nobody will ever regress. A further 6 come from the vendored .claude/skills/impeccable/ tree, one of them a minified third-party bundle whose internal list of image formats is meaningless to us.

Two separate narrowings were on the table and were nearly decided independently: splitting the discriminant class, and excluding vendored code. Handled separately they are two ad-hoc carve-outs with no shared bar, which leaves nothing for the third and fourth narrowing to clear.

The failure mode that matters is not a census that is too large. It is a narrowing that silently excludes more than intended while still printing PASS, which is 0301's green-signal-measuring-the-wrong-thing appearing in the very tool built to stop it.

## Options

- One admission test with two clauses, where every exclusion is named, carries a stated reason, stays in the denominator and is printed every run - ADOPTED
- Two independent narrowings, one for emitted discriminants and one for vendored code - rejected, no shared bar means every future narrowing is another unexamined carve-out
- Drop the emitted-discriminant class wholesale to shrink the number - rejected, the class contains outcome.mjs#kind, which is precisely the defect this exercise exists to catch
- Keep all 52 in scope with no exclusions at all - rejected, a witness cannot be added to a vendored library and its next version changes the set underneath us
- Write test coverage for the exclusion logic - rejected, see outcome

## Outcome

Two clauses. A closed vocabulary belongs in the census when (1) we own the code, and (2) production code branches on the value. modern-screenshot.umd.js#type fails clause 1; run-engine.mjs#type fails clause 2; outcome.mjs#kind passes both and stays.

An exclusion does NOT remove a vocabulary. The denominator stays at 52, every exclusion carries a stated reason naming which clause it fails, and the excluded set is printed on every run, so the report reads in the form "46 finding(s), 6 excluded" rather than simply "46".

No test is required for the exclusion mechanism. There is no hidden state to test: a narrowing that overreaches shows up as a number moving in the output rather than as silence, so the check reports its own scope and the check is the test. This also satisfies the project test admission gate independently, since a test here would assert internal bookkeeping rather than observable behaviour, and the observable behaviour is already on stdout.

Clause 2 is deliberately mechanical rather than a matter of taste, so the line stays where it is put instead of drifting each time someone wants a smaller number.
