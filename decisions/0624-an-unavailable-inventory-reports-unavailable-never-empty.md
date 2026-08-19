---
Status: accepted
Date: 2026-08-19T16:49:58.368Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0624. The skill census reports itself unavailable rather than empty, and the settings-declared plugin route is rejected

## Context

The trunk repair found two independent causes. The second was skill-shape.test.mjs:80 returning an empty inventory when the plugins manifest at HOME could not be read, so a census that could not look reported that it looked and found nothing. That single early return produced both halves of the failure: an empty qualified set misclassified valid tokens, and an empty unresolved set rendered the diagnostic as none, which is why the message read as self-contradictory. The candidate alternative was to source the liveness claim from settings.json, which declares receipts@receipts at :306-321.

## Options

- Give the inventory an availability discriminant so an unreadable manifest reports unavailable and never empty - the honest negative, and it fixes both halves at one site
- Source the claim from settings.json enabledPlugins - rejected on evidence: that file declares PLUGINS and never SKILLS, so it cannot carry a skill-liveness claim at all
- Skip or relax the assertion until the environment is richer - refused, it is the vacuity this whole stack exists to remove

## Outcome

The availability discriminant ships, with the census split so a token that cannot be checked is distinguishable from one that was checked and passed. The settings.json route is closed on evidence, not preference. Two further mutations partially survived and were filed rather than hidden: a bare plugin-skill reference under an absent manifest, and an empty token census in available mode; both pre-date this change.
