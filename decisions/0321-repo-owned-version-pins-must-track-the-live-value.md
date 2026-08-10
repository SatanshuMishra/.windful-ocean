---
Status: accepted
Date: 2026-08-10T21:30:21.264Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0321. A repo-owned version pin must track the live value, or promotion silently downgrades it

## Context

statusLine is in REPO_OWNED_KEYS, so promotion overwrites the live value unconditionally. main declared ccstatusline 2.2.22 while live ran 2.2.27, because the bump landed on an unmerged feature branch (41de7ca) and had been applied live by hand. Validation cannot catch this: the candidate is well-formed, every check passes, and promote exits 0. The rehearsal surfaced it only because the reconciled settings were diffed against the live file rather than assumed from the exit code. A silent downgrade of a repo-owned pin is invisible at promote time and resurfaces later as an unexplained version regression with no obvious cause.

## Options

- Bump the repo declaration to the latest published version so repo and live agree, and diff reconciled settings against live on every rehearsal - ADOPTED
- Move statusLine into LIVE_OWNED_KEYS so promotion never touches it. Rejected: the repo would then declare nothing about the status line, and its drift would go unmanaged entirely
- Accept the downgrade and re-apply the newer version live after each promote. Rejected as a standing manual step that defeats the point of having promotion own the key

## Outcome

Adopted 2026-08-10. Fixed in PR #61, merged at 75b90a3, with the check red on parent bdbb01a and green on the fix; the live promote then wrote 2.2.27 with no downgrade. The general rule this sets: every repo-owned key that pins a version is a promotion hazard, and the rehearsal's reconciled-versus-live diff is the only check that catches it - an exit code never will. Any future rehearsal that reads only the status line and not the diff is not a rehearsal.
