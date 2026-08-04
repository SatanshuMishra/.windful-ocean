---
Status: accepted
Date: 2026-08-04T16:00:08.175Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0234. A plugin-data store may ground a corpus claim once proven byte-identical to the _ledger ref over the cited range

## Context

0209 rules that refs/heads/_ledger is the only authoritative decision store and that plugin-data copies must never be read as authority. 0233 then required a corpus citation to name a bounded range and the store it was read in. Round 5 had to enumerate and open all 98 records of band 0130-0227 across four parallel agents. Reading through the git ref directly means one git show per file with no directory to list, which breaks the re-runnable enumeration the marking is built on and gives an agent no way to prove it opened every file. Reading the plugin copy is ergonomic but, on 0209's face, inadmissible.

## Options

- Read every record through git show against the _ledger ref, losing the enumerable directory and the re-runnable enumeration proof
- Read the plugin copy and cite it per 0233, accepting that 0209 makes it non-authoritative
- Read the plugin copy and prove byte-identity with the _ledger ref over the cited range before trusting it
- Create a throwaway worktree of the _ledger ref for the duration of the marking

## Outcome

PROVE IDENTITY OVER THE CITED RANGE, THEN READ THE ERGONOMIC COPY. Before dispatch I ran git show of each _ledger decision file piped to cmp against the store copy, over all 98 files of band 0130-0227: 0 differing. The agents then read the logbook-logbook copy with its directory listing intact, and every marking table heads with the store path, the enumeration command and the identity proof. PATCH-F re-ran the same comparison independently rather than inheriting my result, and reached 98 compared / 0 differing.

The rule this sets: 0209 forbids TRUSTING a plugin copy, not TOUCHING one. A copy proven equal to the authority over exactly the range cited is not a second source, it is the same bytes with a usable index, and the proof is one cheap re-runnable command a later reader can execute. The proof must be scoped to the cited range and re-run per pass - it says nothing about records outside the band, and it goes stale the moment either store is written.

A worktree was rejected as disproportionate for a read-only pass; git show alone was rejected because it costs the enumeration proof, and enumeration-with-proof is the entire point of the marking under 0230's LIMIT FOUND. Measured consequence: it also caught a real drift fact. All three stores now hold 233 records, so the SPEC's 227-vs-230 figure was stale on both halves; the store that actually diverges is session-continuity-inline at 206 - which is the store 0209's own blocking finding was read from.
