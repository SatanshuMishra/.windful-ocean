---
Status: accepted
Date: 2026-08-12T07:31:50.657Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0376. The two dispatch sites the census could not classify are forced to a decision in their own MSP rather than left open

## Context

The full walk left two classification problems it could not resolve from the call sites alone. redispatch (mitosis.js:3569) is the shared corrective wrapper makeRemediation reuses after ANY stage fails, so whether it is mechanical or judgment depends on the trigger, not the site. Separately, three b2 sites (supersede :4580, ci-publish :5222, ship :5329) run a deterministic command and then perform a small interpretive step - composing an interdiff summary line, or extracting structured facts from raw CI log text. The SPEC's own testing discipline says a closed census must halt on the unclassifiable, so leaving either as a soft note would violate the rule the SPEC is built on.

## Options

- Force-bucket them as mechanical to keep the census clean. Inflates the headline and hides genuine model use behind a number quoted as evidence.
- Force-bucket them as judgment. Understates the eliminable count and preserves five dispatches that are mostly deterministic.
- Record them as residuals that bind a named MSP to decide per-site, and publish a bound rather than a single figure.
- Resolve them now in the SPEC by reading each prompt closely.

## Outcome

Recorded as residuals 7 and 8, each binding a specific MSP. Residual 7 requires C7 to give redispatch a determinate home - the retry becomes a property of each converted stage, or it survives as an eleventh judgment kind - and states it may not remain unclassified. Residual 8 requires C4 to decide per hybrid site whether the interpretive half becomes a deterministic parse over structured CI output (preferred, since the data is machine-readable at source) or is promoted to a tenth judgment kind added to section 2.3's table, with the choice recorded in the PR body. The census publishes 27 as the upper bound and 24 as the floor on eliminable dispatches. Resolving it inline was rejected: the answer depends on what the CI output actually contains at each site, which is implementation-time knowledge, and this thread is barred from implementation.
