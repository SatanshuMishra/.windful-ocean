# Security Response

On finding a security issue: stop, dispatch `security-reviewer` on the diff, fix CRITICAL before continuing, rotate any exposed secret, and check the rest of the codebase for the same pattern.

Read secrets from the environment at run time and fail with a clear error when one is unset. `secret-scanner.sh` blocks any write that hardcodes one.

Findings against this machine's bash gate follow `docs/security/bash-gate-threat-model.md`, which overrides the escalation order above for the gate itself: log a finding against one of its stated non-goals there as an accepted risk, and start a fix round only for the rest.
