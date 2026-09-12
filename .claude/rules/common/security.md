# Security Response

On finding a security issue: stop, dispatch `security-reviewer` on the diff, fix CRITICAL before continuing, rotate any exposed secret, and check the rest of the codebase for the same pattern.

Depth on web application security - injection, access control, XSS, CSRF, SSRF, auth flows, JWT, CORS, headers, prompt injection - is the `vibesec` skill. Secrets in a diff are caught by `secret-scanner.sh` before the write lands.

This machine's bash gate is governed by `docs/security/bash-gate-threat-model.md`. That document overrides the escalation ordering above for findings against the gate itself: a finding against one of its stated non-goals is logged there as an accepted risk rather than starting a fix round.
