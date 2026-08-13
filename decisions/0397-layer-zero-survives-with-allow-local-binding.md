---
Status: accepted
Date: 2026-08-13T18:48:08.384Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0397. Layer 0 survives on one key; the default sandbox configuration is unsafe

## Context

Experiment U3 on 2026-08-13 first appeared to kill Layer 0. The sandbox blocks loopback: NO_PROXY carries localhost, 127.0.0.1 and ::1, so loopback bypasses the proxy that implements the allowlist and is then denied at the network layer with EPERM, which no allowedDomains entry can reach. Worse, under the default allowUnsandboxedCommands a denied command is silently re-run fully unsandboxed and reported as succeeded, so the default configuration's containment is illusory precisely for the commands that matter. A follow-up enumerated the installed build's sandbox schema and found no network.disabled key, only filesystem.disabled, which is the inverse of what was needed.

## Options

- Drop Layer 0 entirely as refuted
- Adopt the strict sandbox and accept that every local dev server and test harness breaks
- Amend Layer 0 with sandbox.network.allowLocalBinding

## Outcome

Amend Layer 0 with sandbox.network.allowLocalBinding true, alongside allowUnsandboxedCommands false and failIfUnavailable true. Verified under that configuration: loopback connects and returns 200, writes inside the working directory succeed, writes to the home directory and into the repository are denied with EPERM, credential reads are denied, external HTTPS still returns 403 from the allowlist proxy, and sandbox engagement is provable. allowLocalBinding was isolated as the causal key. Filesystem containment, working localhost and allowlisted egress therefore hold simultaneously - the trade the refutation implied does not have to be made. The default configuration must be documented as unsafe rather than merely incomplete, because it reports success while abandoning the sandbox.
