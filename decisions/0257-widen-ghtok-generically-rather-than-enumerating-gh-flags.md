---
Status: accepted
Date: 2026-08-06T05:31:17.993Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0257. Close the gh-adjacency bypass by deriving the flag shape from gh's parser, not by enumerating flags

## Context

Verifying the merge deny against Definition of done item 1 found G1 open. The ghtok local hard-codes gh immediately followed by its subcommand, so any flag placed between them defeats every clause built on it: gh -R owner/repo pr merge 12, gh --repo=owner/repo pr merge --admin, gh -X PUT api repos/o/r/pulls/12/merge and gh --hostname github.com api ... all returned no opinion. Probing gh 2.97.0 showed cobra resolves a pre-subcommand flag against the resolved subcommand's own flag set, and that ONLY value-taking flags are reachable there - boolean flags (-i, --paginate, --silent) are rejected by gh itself because the parser assumes an unknown flag consumes the next argument. This is a finding against a stated Goal, so section 8 makes it a defect, not an accepted risk. settings.json's Bash(gh pr merge:*) prefix rule carries the identical assumption and misses the same phrasings, so both G1 layers failed together on one input.

## Options

- Enumerate the reachable gh flags: -R/--repo, -X/--method, --hostname, -H, --cache, -f/-F, --input, -q, -t
- Widen ghtok generically to any value-taking flag, a shape derived from gh's own parser behavior
- Leave it and log an accepted risk

## Outcome

Widen ghtok generically, mirroring the gitopt/gitpre construction already in the file: gh followed by zero or more value-taking flag tokens, then the subcommand. Both candidate patterns produced a byte-identical result across the 61-command probe corpus and 24 benign gh commands, so the tie broke on drift: the generic form encodes why the set is bounded (a value-taking flag is the only kind gh accepts in that position), while an enumerated list silently rots as gh adds flags. Doing nothing was rejected because G1 is a Goal. The change necessarily also closes the same bypass in the creation and edit clauses - gh -R owner/repo pr create --fill was allowed - since ghtok is one shared local; that is a consequence of the fix, not a scope expansion, and c5 still owns verifying the rest of the G2/G3 surface.
