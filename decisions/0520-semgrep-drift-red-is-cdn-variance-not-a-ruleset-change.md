---
Status: accepted
Date: 2026-08-17T14:53:52.263Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0520. The semgrep p/default drift red is CDN variance; the pin stays unvendored

## Context

The sast job fetches https://semgrep.dev/c/p/default live, canonicalizes it, and compares the sha256 to a pin at .semgrep/p-default.sha256. It went red on PR 181 and again on the main tip 425b06fb, both times computing cd011090... against the pinned d9f73571... Its own failure message asserts this "reflects a genuine rule-content change upstream, not mere reordering" and instructs re-vendoring the pin. That instruction is wrong here: a local fetch computes exactly the pinned d9f73571..., and the same runs pass intermittently - sast was green on f6a64c3e, 3bbb210b and 4a2d079a and red on 425b06fb, and a re-run of the identical failing commit went green with no code change. Upstream is serving two different variants of the same ruleset depending on which edge answers.

## Options

- Re-vendor the pin to cd011090... as the failure message instructs
- Keep the pin and treat the red as intermittent CDN variance, re-running the job when it fires
- Remove the drift guard entirely
- Vendor the ruleset into the repository so the check stops depending on a live fetch

## Outcome

Keep the pin at d9f73571... and treat the red as intermittent. Re-vendoring would adopt a hash that upstream does not reliably serve, would discard a correct supply-chain control on the strength of a flake, and would force an unnecessary re-adjudication of the nosemgrep pragmas. A re-run clears it. The durable defect is the design: a guard that fetches live and compares to a fixed hash will keep producing false reds and will train readers to ignore a security check. Vendoring the ruleset into the repository is the real remedy and is filed as a gap against the standard rather than fixed in flight, since no acceptance criterion covers it.
