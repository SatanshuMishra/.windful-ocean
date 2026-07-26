---
Status: accepted
Date: 2026-07-26T20:23:24.784Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0008. b0e1079 is not merged as-is; the quoted-literal regression is closed first

## Context

The thread's next_step instructed: land b0e1079 (merge, publish, re-install, restart). Pre-merge verification found a security REGRESSION in b0e1079 that the thread's accepted-limits note does not cover.

hooks/lib/pre-tool-use.mjs stripQuoted() erases quoted spans before tokenizing, so a quoted destructive target disappears and the command is allowed. Measured directly against the branch module with roots set to the real plugin data project dir:
- rm -rf "<abs store path>"  old DENY, b0e1079 ALLOW
- rm -rf '<abs store path>'  old DENY, b0e1079 ALLOW
- echo x > "<store>/threads/x.json"  old DENY, b0e1079 ALLOW
- ls -la <store> 2>/dev/null  old DENY, b0e1079 ALLOW (this row is the INTENDED over-blocking cure, not a regression)

The thread documented exactly two deliberate under-blocks: quoted VARIABLE indirection ("$LEDGER/x") and unresolved symlinks. A quoted LITERAL path is neither. Quoting a path is ordinary shell idiom, so this is an unintended consequence of stripQuoted rather than an accepted trade-off. Independently, the branch is otherwise sound: full suite green at 503 pass / 0 fail, leak scan of the diff clean (0 hits for the confidential codename, personal paths, DevLabs, API keys, and 0 absolute /Users paths), and the branch genuinely fixes over-blocking, tilde/relative under-blocking, and plugin-namespaced tool matching.

## Options

- Merge b0e1079 as-is now and file the quoted-literal hole as follow-up work
- Close the quoted-literal regression on the branch first, then merge the branch whole
- Abandon b0e1079 and keep the old 0fe1c02 guard

## Outcome

Chosen: close the regression on fix/pre-tool-use-guard first, then merge the branch whole as one PR. Rationale is the Three Pillars - merging a known security regression to obtain the ergonomics fix sooner trades Quality for Speed, which is forbidden. Keeping 0fe1c02 was rejected because the live guard is strictly worse overall: it over-blocks read-only commands (it denied two harmless orchestrator reads this session) while ALLOWING rm -rf on a tilde or relative path to the store. The fix is scoped to quote-aware tokenization: preserve quoted literal content as a single token including paths containing spaces, keep segment splitting from breaking inside quotes, and leave any quoted span containing $ or a backtick failing toward allow so the documented variable-indirection limit is preserved deliberately rather than accidentally. Delivered TDD, red first. Ref-level and worktree-admin coverage remain OUT OF SCOPE for this merge and stay recorded in 0007.
