Resumed via lift-off on explicit slug, transitioned paused to active, re-dispatched the solution-architect that the prior session lost. User instruction was "Go. Think hard." No implementation code was written; no commit, merge, publish or install. Both repos left clean. continuity-ledger-plugin remains checked out on the BLOCKED branch fix/pre-tool-use-guard at 5f04dd4; merge block still stands.

WHAT SHIPPED
- The design spec EXISTS this time: .claude/docs/superpowers/specs/2026-07-26-pre-tool-use-guard-deny-by-default-design.md in windful-ocean. Written by the orchestrator from the architect's returned text immediately on return, because solution-architect is read-only and the prior session lost its output to a context wrap. Untracked, not committed.
- Decision 0018 recorded: design approved, all six open user calls resolved as recommended.
- Decisions A-H all settled with options, trade-offs, recommendations and confidence levels. Includes a 45-row tokenizer probe table measured against the frozen shell-tokens.mjs.

TWO FINDINGS THAT CHANGE THE INHERITED PICTURE
1. Deny-by-default alone does NOT close backgrounding, and a naive inversion INTRODUCES an evasion neither current guard has. A bare ampersand is an ordinary word character, so ls ROOT ampersand rm -rf ROOT is ONE segment headed by ls; allowlisting ls would allow the rm -rf. Decision 0011 assumed inversion closed grouping AND backgrounding; it closes grouping only. A guard-level control-split pass is now load-bearing, and it MUST carry an fd-dup exemption for an ampersand-digit token following a redirect token or test/unit/hooks/pre-tool-use.test.mjs:139 breaks.
2. Whole-command scoping - proposed by the orchestrator as a stronger fix for pipeline blindness - was evaluated and DISQUALIFIED. Heredoc bodies tokenize as independent segments with arbitrary first words, so it denies every heredoc in any root-referencing command and resurrects the canonical false positive for a new reason. Per-segment deny plus two sink overlays was adopted instead.

ALSO MEASURED THIS SESSION
- scanSegments cost curve past the realistic band: 25.34 ms at 16 KB, 166 ms at 32 KB, 755 ms at 64 KB, 4.1 s at 128 KB, 16.6 s at 256 KB. This sizes MAX_COMMAND_BYTES at 16384.
- The live 0fe1c02 guard denied a pure read during this session - a cat piped to python3 with a stderr redirect - because the redirect alternative in MUTATING matched while the command carried a root substring. The canonical bare-redirect false positive, reproduced first-hand.
- Existing guard suite re-confirmed at 23 tests / 23 pass locally.

SEPARATE DEFECT FOUND, NOT AUTHORIZED, NOT FIXED
The session-continuity Stop hook nags every turn while any thread is active. hooks/lib/stop.mjs:5-13 returns exitCode 2 unconditionally whenever active-thread returns an id, and never reads ctx.input - which hook-io.mjs:28 already provides. Claude Code docs confirm Stop fires "whenever Claude finishes responding, not only at task completion" and that a hook "needs to check whether it already triggered a continuation" via stop_hook_active. The hook is also aimed at the wrong event; SessionEnd is what it means. Consequence: the plugin's own documented lifecycle (active while worked, paused at hand-off) is unusable, and ledger-cli sync at stop.mjs:11 only ever runs on the no-active-thread path. The thread was deliberately NOT parked at paused mid-session to silence it, because that path would have triggered sync, which this thread lists as out of scope.

NOT DONE
No code, no tests, no size cap, no review, no merge. Criteria 1 through 5 all remain false. The implementation order in the spec has not been started.