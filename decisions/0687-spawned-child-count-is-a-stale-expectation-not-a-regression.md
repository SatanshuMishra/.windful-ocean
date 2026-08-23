---
Status: accepted
Date: 2026-08-23T18:36:28.635Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0687. The six-versus-seven spawned-child count is a stale test expectation, not a regression

## Context

unit-verdict-sha.test.mjs:238 asserts seven spawned children and the trunk produces six. Bisection by extracting each commit with git archive, corroborated by CI, pins the change to 33459915 (#286): last green is run 32657059483 at e19091fe, first red is run 32657068524 at 33459915. The discriminating evidence is what the seventh child actually was. Before #286 it was handed a false premise, that the gate had found new lint and type errors when it had found none, and a working directory that does not exist, and it died with spawn ENOENT. The collection-refused classifier has exactly one producer and every path to it returns nothing compared, so the guard cannot suppress a legitimate dispatch; a genuine boundary violation still takes the new-finding path and still dispatches.

## Options

- Treat six as a regression and restore the seventh dispatch
- Change the assertion to six
- Change the assertion to six and also pin the integrate outcome so the count explains itself

## Outcome

Change the assertion to six with a message stating why no boundary-fix child is composed. The test was green before only because the fixture's non-git scratch root drove the gate into a refusal and the old engine dispatched on that path, so seven never described healthy behaviour; it counted a wasted, misdirected dispatch. On a live run the terminal state is parked either way, and the change removes one billed child that could not have succeeded. Pinning the integrate outcome as well would make the count self-explaining but sits above the acceptance ceiling and is filed. Also filed: nobody has established why #286's own pre-merge CI did not catch this.
