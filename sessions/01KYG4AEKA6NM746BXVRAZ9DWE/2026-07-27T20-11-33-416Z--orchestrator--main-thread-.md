SESSION: architectural reversal. Round C is killed and the shell parser is deleted. No code changed this session; decisions only, handed off for a fresh session to implement.

WHAT HAPPENED. Resumed the thread, then the user challenged the premise rather than the findings: the approach is fragile (regex/string matching over infinite possibilities), and separately, is this a non-issue given a user can always delete their own files? Dispatched two Fable researchers in parallel (robust+simple alternatives; is-the-threat-real). Both returned BLOCK-equivalent verdicts on the parser and converged on the same architecture.

THE DECISIVE FINDING (verified by me in code, not taken on trust). The ledger's authoritative store is git commits on refs/heads/_ledger inside the project's own .git, committed per mutation and pushed to origin at session end. The guarded directory under $CLAUDE_PLUGIN_DATA is a DISPOSABLE worktree that the plugin itself rm -rf's and rebuilds on every init (git-ref-driver.mjs:209-213, #ensureWorktree). The guard has been defending the throwaway cache.

VERIFIED BY EXECUTION against classifyBashCommand (roots ['/data/-proj/ledger'], base '/proj'):
  ALLOWED silently: git branch -D _ledger | git update-ref -d refs/heads/_ledger | git push origin :_ledger | git gc --prune=now | PATH=/tmp cat ROOT/PROJECT.md
  DENIED: rm -rf ROOT | git worktree remove --force ROOT
So the parser blocks destruction of the recoverable copy and passes every kill-path for the durable one. CRITICAL-3 (PATH hijack) reproduced live.

ALSO VERIFIED. selectDriver uses GitRefDriver only for git worktrees; otherwise LocalDriver, whose commit() and sync() are literal no-op stubs (local-driver.mjs:183-189). Non-git projects have NO history, NO remote, NO recovery. That is the only store where rm -rf is permanent, and it has received none of the 23 commits of guard work.

EXTERNAL EVIDENCE. Cursor shipped this same architecture, was bypassed four ways, and DEPRECATED its auto-run denylist in v1.3; its docs now call command controls best-effort guardrails, not a security boundary. Claude Code's own docs concede prefix rules match literal strings and miss /bin/rm and find -delete, and it ignores Bash(rm *) rules with a startup warning; Anthropic points to the OS sandbox (Seatbelt/bubblewrap) for real enforcement. Git does not protect .git from rm -rf; its model is recoverability. Named anti-pattern: shotgun parser / parser differentials (LangSec, USENIX). Every hole in this branch's 23 commits is a parser differential.

USER RULINGS. Kill Round C. Delete the parser outright. Fix non-git recoverability. Solution must be simple + robust. Threat model scoped explicitly: prevent the LEDGER and AGENTS from accidentally deleting something; do NOT babysit the user's own deliberate deletion.

NOT DONE / DEFERRED. No code deleted or written this session. Branch topology for reverting 18 commits not decided. The thread's completion criteria were written for the parser design and criterion 4 (clean review of the parser) is now moot - they need re-deriving before any DoD close. Stop-hook nag (stop.mjs exits 2 unconditionally, never reads stop_hook_active) remains open and unauthorized.

RESEARCH CAVEAT carried forward: the blast-radius-is-minutes claim depends on per-mutation commit and Stop-hook push actually firing. No-remote repos, or an agent that disables hooks before destroying ref+remote, degrade recoverable to unrecoverable.