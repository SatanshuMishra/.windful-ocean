# Security Response

On finding a security issue: stop, dispatch `security-reviewer` on the diff, fix CRITICAL before continuing, rotate any exposed secret, and check the rest of the codebase for the same pattern. In a pipeline run the round's security reviewer is that response: a Worker or step session reports the issue in its reply.

`secret-scanner.sh` blocks an Edit or Write that carries a secret; Bash, NotebookEdit and MCP writes are not scanned.

A finding against this machine's bash gate or database gate follows that gate's threat model under `docs/security/` instead: one against a stated non-goal is logged there as an accepted risk, not fixed.
