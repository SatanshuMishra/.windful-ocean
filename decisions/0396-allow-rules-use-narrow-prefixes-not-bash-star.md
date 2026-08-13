---
Status: accepted
Date: 2026-08-13T18:47:55.742Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0396. Allow rules enumerate narrow prefixes; a broad Bash star rule is counterproductive

## Context

SPEC section 6 step 3 calls for a broad Bash allow rule, on the documented reasoning that the right shape is a wide allow plus a PreToolUse hook rejecting specific commands. Experiment U2 on 2026-08-13 refuted this for auto mode: a broad Bash star rule is silently discarded, with the debug log recording that it is ignored as a dangerous permission that bypasses the classifier, after which the command falls through to the classifier and is blocked. A narrow rule such as Bash(chmod:*) both executes and skips the classifier entirely. In default mode the broad rule is honored normally.

## Options

- Broad Bash allow as the SPEC specifies
- Enumerated narrow command prefixes
- No allow rules, relying on the run mode alone

## Outcome

Enumerate narrow command prefixes. Written as specified, step 3 would produce strictly less autonomy under auto mode than enumerating prefixes, and the rejection is visible only at debug level and never in the transcript, so the regression would have shipped silently and looked like the opposite of what it is. This governs the interactive and auto-mode configuration; under bypassPermissions allow rules are inert regardless, so the change costs nothing there.
