---
Status: accepted
Date: 2026-08-24T23:40:16.334Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0725. U2.3 splits into a receipts half that ships now and a CI-lane half that waits for a green suite

## Context

U2.3's acceptance criterion 1 requires ci.yml to complete with conclusion success on the unit's own pull request. Measured on a fresh clone at trunk 9392037: npm test exits 1 with tests 2299, pass 2256, fail 41, skipped 1, todo 1. An honest lane running that suite reports failure, so criterion 1 is falsified rather than unverified, and every route to a green lane is forbidden - no bare true, no continue-on-error, no pinned failure count, no narrowed glob. A census of the 41 failures against what U3 and U4 declare they own found roughly 17 cases across 13 files outside both ceilings, so reordering U2.3 after them does not fix it either.

## Options

- Reorder U2.3 after U3 and U4 - refuted by the census: roughly 17 cases in 13 files fall outside both units' declared ceilings, so U2.3 would arrive still blocked
- Ship U2.3 whole after a green-the-suite unit lands - keeps the unit intact but leaves every MSP ungated until the suite is green
- Split U2.3: ship the receipts wiring now as U2.3a, ship ci.yml as U2.3b once the suite exits zero
- Park U2.3 and continue the wave order - leaves filed item 5's vacuous-pass surface open with no gate on any pull request

## Outcome

Split. U2.3a ships receipts.yml and receipts.config.json now: that diff is config-only, so its own pull request does not depend on a green suite, and every later MSP gains pr-title-lint and enforcer refereeing instead of no gate at all. U2.3b ships ci.yml with all three original criteria once the suite exits zero. Neither half weakens a lane and neither reaches above a ceiling.
