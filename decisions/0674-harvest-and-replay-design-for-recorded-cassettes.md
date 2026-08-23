---
Status: accepted
Date: 2026-08-23T04:04:09.002Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0674. Recorded cassettes fold onto the four kinds the replayer can actually route

## Context

The recorder and the replayer disagree about the dispatch-kind vocabulary. The engine classifies a dispatch into one of eight kinds by schema object identity plus call ordinal, but the replay stub routes by live schema reference identity and can only ever resolve four: plan, plan-review, review and implement. A cassette keyed replan, redispatch, security or diagnose loads cleanly, is never consumed, and still satisfies the exhaustion census, because a kind that is never touched fires zero exhaustion events. It would report a pass while its scripts did nothing. Separately, the sweep driver hard-refuses any cassette that is not authored with a null sourceRun, so no recorded cassette can be replayed at all today; sourceRun appears nowhere in the dispatch record; and two recorded payloads are bound to the billed run's filesystem, a plan carrying an absolute temp path and an implement carrying a substrate commit the replay fixture has never seen.

## Options

- Fold the recorder's kinds onto the replayer's four, exclude the two environment-bound scripts, source sourceRun from the sibling plan document, add a directory knob to the driver and require positive consumption per scripted kind.
- Teach the replayer to route the full eight-kind vocabulary, so recorded cassettes keep the recorder's own classification.
- Rewrite the environment-bound payloads at load time so recorded plan and implement scripts can be replayed against the fixture.

## Outcome

Fold at harvest time onto the four routable kinds: replan into plan, redispatch into implement, security into review, diagnose into implement, ordered by file line order because the fold merges two independent iteration counters. Exclude the plan and implement scripts by default and report the excluded counts, matching what the authored cassettes already do and for the same reason. Take sourceRun from the sibling plan document's runId, pinned because it is the logical identifier a human can match to the billed lane while the top-level field was observed null. Give the driver a SWEEP_CASSETTE_DIR override while keeping the scenario filename table intact, so authored and recorded sets stay name-for-name comparable, which is what the acceptance criterion diffs. Relax the provenance guard to accept authored-with-null or recorded-with-non-null and refuse every other combination, rather than deleting a guard that genuinely protects against a cassette lying about its evidence class. Extend the census to require a positive consumption count per scripted kind, closing the vacuous pass. Teaching the replayer eight kinds is rejected as an engine-behaviour change the SPEC places out of scope. Rewriting payloads at load time is rejected because it would stop the cassette being a faithful recording, which is the entire property M8 buys.
