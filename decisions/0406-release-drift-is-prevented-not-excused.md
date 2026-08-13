---
Status: accepted
Date: 2026-08-13T23:27:53.121Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0406. Release-tree drift is prevented at its source, never excused by verify

## Context

config verify reported `hooks/agent-ledger/__pycache__/_ledger.cpython-314.pyc` as present in live but not declared by the release. The file is CPython's ordinary bytecode cache, written because hooks resolve through ~/.claude/hooks -> current/hooks into releases/<sha>/ and three of them import _ledger.py. `__pycache__/` is gitignored, so it can never be declared by any release and the finding would recur after every promotion. The standing watch-out framed the choice as "excluded or prevented", leaving both doors open.

## Options

- Add __pycache__ to an ignore list inside verify so the census skips it
- Set PYTHONDONTWRITEBYTECODE=1 in the tracked settings env block so CPython never writes bytecode
- Invoke each python hook with -B, or set sys.dont_write_bytecode inside the affected modules
- Make the release tree read-only with chmod -R a-w after build

## Outcome

Chose PYTHONDONTWRITEBYTECODE=1 in the tracked settings env block. An ignore list is rejected outright: rules/common/testing.md forbids exactly that gate shape ("a pinned count or a sampled allowlist is forbidden"), and it would convert real drift into invisible drift, which is worse than a red verify. Per-hook -B and sys.dont_write_bytecode were rejected as per-call-site fixes that any new python hook silently escapes, whereas one env key covers every hook the harness spawns. chmod -R a-w was rejected for this round because collectGarbage rmSyncs release dirs and rollback renames them, so a blanket read-only tree needs its own design pass. The general rule this settles: a post-build mutation of the release tree is stopped at the writer, never accommodated in the checker - verify's census stays closed. Verified with a red/green receipt (a __pycache__ dir appears with the var unset and does not with it set) and confirmed already live in-session, since project settings env applies immediately. Shipped as 8377436.
