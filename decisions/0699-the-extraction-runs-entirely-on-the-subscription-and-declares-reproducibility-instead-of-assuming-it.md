---
Status: accepted
Date: 2026-08-24T04:02:47.123Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0699. Everything runs on the Claude Code subscription; hermeticity is replaced by a recorded environment fingerprint

## Context

This supersedes decision 0695, which was wrong. No spend outside the existing Claude Code subscription is permitted anywhere in this work. The earlier record adopted an API key because the extraction SPEC chose a minimal CLI mode for the contract capture, and that mode was allowed to gate the whole migration. Four probes on 2026-08-23 establish the real constraint: the minimal mode with an API key and no console credit fails on billing; the minimal mode with no API key reports not logged in; the environment variable that mode sets carries the same auth restriction on its own; and plain headless print mode with no API key succeeds on subscription authentication. The minimal mode's own help states that OAuth and the keychain are never read. So reproducibility across machines and subscription authentication cannot both be had. Separately, narrowing flags were measured to reduce loaded local configuration from roughly 77,900 to 63,200 tokens, which helps but does not approach isolation.

## Options

- Keep the minimal mode and buy console credit
- Run plain headless print mode on the subscription and replace the lost isolation with a recorded environment fingerprint that attributes a mismatch to vendor drift or to local configuration drift
- Abandon the contract lane and rely on replay alone

## Outcome

Option 2. The engine itself never needed a key; it spawns the CLI through its execution allowlist on subscription authentication, which is how the live forge lane passed the first time. Every contract fixture now carries the CLI version, the discovery mode, a content hash of the configuration surface that perturbs a run, and the measured context size taken from the usage block. A shape mismatch under an equal fingerprint is vendor drift and fails the lane; a shape mismatch under a changed fingerprint is local configuration drift and reports with its own exit code naming the component that changed. The capture profile is pinned as the narrowest reproducible one the subscription allows. Two measured contract facts are folded in that the minimal-mode design would have missed: the payload key set is outcome dependent, with three timing keys present only after a successful round trip, so key sets are recorded per outcome class; and the reported cost figure is notional under a subscription, so it is never recorded as a spend claim. The binding budget becomes plan usage and rate limits, so captures batch inside the one-hour prefix-cache window and rate limiting joins transport failure as a retryable condition, while a contract mismatch stays non-retryable. What is given up is cross-machine reproducibility of a capture, which is named in the affected unit's unproven field and as a standing non-guarantee rather than hidden.
