# Security Response

On finding a security issue: stop, dispatch `security-reviewer` on the diff, fix CRITICAL before continuing, rotate any exposed secret, and check the rest of the codebase for the same pattern.

`secret-scanner.sh` checks every write and blocks one that carries a secret.

Findings against this machine's bash gate follow `docs/security/bash-gate-threat-model.md`, which overrides the escalation order above for the gate itself: log a finding against one of its stated non-goals there as an accepted risk rather than starting a fix round.
