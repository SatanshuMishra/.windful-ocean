# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues

## Bash Gate Exception

- This machine's bash gate (`.claude/hooks/block-destructive-bash.sh`) is governed by `docs/security/bash-gate-threat-model.md`.
- That document overrides only the Security Response Protocol's escalation ordering for gate findings — steps 1 ("STOP immediately") and 3 ("fix CRITICAL issues before continuing") above. It does NOT exempt the gate from Mandatory Security Checks, Secret Management, or the Response Protocol's remaining steps.
- Before starting a fix round on a finding against the gate, check it against that document's stated goals and non-goals.
- A finding against a stated non-goal is logged there as an accepted risk, not fixed — do not restart the fix-round cycle that document exists to stop.
