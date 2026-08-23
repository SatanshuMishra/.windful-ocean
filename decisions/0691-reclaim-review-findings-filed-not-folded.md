---
Status: accepted
Date: 2026-08-23T20:56:02.854Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0691. Seven reclaim review findings are filed against the standard rather than folded into the fix

## Context

A focused review of the boundary reclaim fix returned GO for a single-host local billed run and confirmed the property that mattered: the new option threads through every construction site with no permissive default, and the reclaim is scoped to a four-segment boundary namespace, so neither the primary checkout nor any of the repository's other worktrees can be reached. It also confirmed the four updated phase-driver assertions were pinning request shape, not masking a regression.

Eight findings came back. One is being closed now because it is the proof that the fix under test actually engages. Seven are not reachable on the machine the run executes on, and folding them in would reopen a unit that has already met its declared criterion.

The one being closed, F1: reverting the signal at its source leaves the full suite byte-identical at 2361 pass and 20 fail, so nothing turns red. The two new tests hand the boolean directly to the reclaim and prove only the final hop. The derivation from the run store, which is the link that failed in the run that cost 2.49 dollars, has no coverage.

## Options

- Fold every finding into the current fix before running
- Close only the coverage gap that proves the fix engages, and file the rest
- Run now and file all eight
- Stop the run and open a hardening unit for all eight

## Outcome

Close F1 only; file F2 through F8 against the standard.

F1 is not scope growth. It is the difference between a fix that is proven to run and one that merely passes tests, and this fix has already failed that exact distinction once. Round one proved a mechanism whose trigger never fired; round two proves a mechanism whose input is fabricated. Paying to discover the third instance is the outcome being avoided.

The filed seven, none reachable on this host. F2: the age fallback fails OPEN where a filesystem does not surface a birth time, since a zero value reads as older than any deadline; real on Linux overlayfs and in containers, not on the local APFS disk this runs from. F3: a successful unlock is never rolled back when the subsequent removal refuses, permanently downgrading a guarded path to an unguarded one for every future run. F4: the liveness probe carries no host or boot identity, so a run store reached over a shared or networked filesystem can break a live holder's lock and then reclaim a live participant's worktree; this is the one concrete sequence that breaks the safety property, and it needs a shared filesystem to fire. F5: an operator force-retiring a live lock produces the same result, and the refusal text warns about interleaved writes without mentioning worktree destruction. F6: the option name asserts a prior attempt is dead when the derivation only proves one existed. F7: the malformed-shape census was not extended to the two new requirements, and its own sound fixture is now malformed under them. F8: the run mutex and the reclaimed directory are keyed differently, so two runs over one boundary namespace do not exclude each other; latent, because a fresh run is always attempt one.

Filing these is the standard's own instruction. An agent may propose a gap and may never promote a review verdict into a project-local mandate, and work discovered above a declared criterion becomes a new item rather than reopening a unit that already met its bar.
