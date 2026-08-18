---
Status: accepted
Date: 2026-08-18T17:44:50.330Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0575. Wave 7 inertness is proven by both mutations, and the exit-42 watch note is wrong on the code

## Context

Decision 0574 shipped wave 7 with the two inertness mutations unrun, carrying an unverified-reasoned downgrade, because six API 529s prevented them and the receipts enforcer then short-circuited without running G14. After the user merged PR 212, the mutations became runnable again. Content identity was established first: 8395cf83 is an ancestor of origin/main (merge commit 5a26fcfc) and the wave-7 paths diff empty against origin/main, so running from the branch checkout is equivalent to running against the shipped state.

## Options

- Leave the question closed as unverified-reasoned since the pull request already merged
- Run both mutations post-merge against the content-identical branch state and either clear or confirm the downgrade
- Restore the nine files through the git index rather than as untracked files

## Outcome

Both mutations ran RED and both were genuinely observable, so the 0574 downgrade is CLEARED and both changes are proven load-bearing. Enumeration was established from code first: derivationA is a readdirSync of .claude/agents minus the retained roster, derivationB is parsed from the roster spec markdown, and shape is retired iff derivationA is empty and no retiring name is on disk - so untracked restores are visible and the index route was correctly rejected. Mutation A (restore all nine) exited 1, 18 tests 17 pass 1 fail, failing at retirement-census.test.mjs:241 with shape actual present-on-disk expected retired, roster 13 to 22. Mutation B (revert the test file to ffb6103f) exited 1, same counters, failing on the old deepStrictEqual of derivationA against the nine names. Tree restored exactly: porcelain back to the three WIP lines, 13 definitions, mp3 sha256 identical to backup. TWO CORRECTIONS FILED. First, the watch list claim that a partial deletion trips the unclassified-name fault at exit 42 is wrong on the code and in observation: the fault fires as exit 1 with kind halt, surfacing one assertion earlier at line 240. Second, the :242 derivationA assertion is REDUNDANT rather than untested, because a passing :241 shape assertion entails derivationA is empty. Also filed: a first mutation attempt exited 1 for the WRONG reason after zsh failed to word-split an unquoted variable and created a garbage roster file, which would have read as a valid RED from the exit code alone.
