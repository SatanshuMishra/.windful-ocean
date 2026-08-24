---
Status: accepted
Date: 2026-08-24T04:28:26.848Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0702. The repository is published at layer 5, not after the suite is green

## Context

U16 makes the repository public, and U15.1 cannot start until it does, so U16's position sets how long the host workstream stays blocked. The plan's original ordering placed it at wave 16, which held six units behind it for roughly nine merges of critical path. The only hard dependency U16 carries is U1, the publication gate, which is satisfied at layer 4. Publishing is irreversible, so moving it earlier had to be settled as a choice rather than absorbed into the schedule.

## Options

- Publish at layer 5, immediately after the publication gate clears
- Publish last, after every unit has shipped and the suite is green
- Publish at layer 5 but keep the host workstream blocked until the suite is green anyway

## Outcome

Publish at layer 5. Safety is governed by the publication gate, which checks for secrets, personal data and the confidential codename, and that gate clears at layer 4; suite greenness is not a safety property and is not what the gate checks. A public repository with a work-in-progress suite is ordinary, while an unpublished one blocks six units. The counter-argument is presentational and loses to nine merges of critical path. The gate is still re-run inside U16 and again after publication.
