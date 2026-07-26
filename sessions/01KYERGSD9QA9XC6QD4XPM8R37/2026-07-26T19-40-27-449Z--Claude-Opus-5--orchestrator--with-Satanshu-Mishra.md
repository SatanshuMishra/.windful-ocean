TRACK A CONFIRMED (evidence, not attestation).

1. Plugin is on the published fix. installed_plugins.json gitCommitSha = 0fe1c021141ebb50deee3d0fcae577248b7e97c4, installedAt 2026-07-26T18:55:07Z. Marketplace clone HEAD is the same SHA and its parent is 3b9de99 - exactly the pre-fix commit named in the prior spine. Marketplace refreshed 18:53:01Z, two minutes before the plugin install; correct order.

2. Restart confirmed for THIS session by process ancestry, not by a name grep: my claude process is pid 71428 started 12:56:51 MDT, 1m44s AFTER the 12:55:07 install; my ledger MCP server is pid 71609 started 12:56:52 MDT. ps cannot prove it was the SECOND restart. Also found build skew: a concurrent session's ledger server (pid 14738) started 00:50:44 MDT, twelve hours before the install, so it is still running pre-fix code against the same store.

3. Live /lift-off ran in this session: rebuild_index returned threads 7 / by_slug 7 / resumable 7, reconcile returned zero drift, get_resume_brief rendered. Independent proof the new build is live: the lift-off SKILL.md served to this session contains the dual-tool-name paragraph that 0fe1c02 added, verbatim.

NOTE: 0fe1c02 changes NO server code (only hooks/lib/pre-tool-use.mjs, two SKILL.md, two tests), so the fix never actually depended on a server restart - skills and hook scripts are re-read from disk per invocation.

TRACK B SHIPPED - commit b0e1079 on branch fix/pre-tool-use-guard, pushed to origin. NOT merged, NOT published, NOT installed.

Defect 1 (tool-name matchers): hooks.json PreToolUse matcher and the auto-approve branch both accepted only mcp__ledger__*, so under a plugin install the hook never ran for ledger tools and never granted them. Both now accept mcp__(plugin_session-continuity_)?ledger__.

Defect 2 + 3 (Bash guard), fixed at the root cause as one change: the old MUTATING regex treated ANY '>' anywhere in the command text as a mutation, and referencesRoot matched the store by naive substring on the absolute root. That denied read-only inspection while letting real destruction through via relative paths, cd, or '~'. hasMutatingConstruct and referencesRoot are replaced by mutatesUnderRoot(command, roots, baseDir), which strips quoted spans, splits into segments, tracks cwd across cd, and asks whether a redirect target or a destructive verb's argument resolves under a root via the same isUnderRoot the Write branch already used.

VERIFICATION. Tests were red first (matcher test failed; module would not import). Full suite green afterwards: 503 tests, 503 pass, 0 fail. Receipt run against the REAL store root: ls with 2>&1, grep with 2>/dev/null, and a quoted '>' all now ALLOW (all three were denied before, one of them live in this session); write-into-store and rm -rf still DENY; 'cd .git/ledger && rm -rf .' and 'rm -rf ~/.../.git/ledger' now DENY where both previously ESCAPED; both ledger tool-name spellings ALLOW.

WHAT DID NOT HAPPEN / FAILED.
- Criterion 5 was NOT flipped to done. Its exact text carries five clauses; two are unproven: 'core.hooksPath reconciled' and 'CLAUDE_PLUGIN_DATA resolving'. A probe resolved only one root (<repo>/.git/ledger), meaning CLAUDE_PLUGIN_DATA was unset in that process - which is not proof it is unset in the hook runtime. Marking it done would have been false.
- The prior risk that these edits could not be delegated and needed direct user approval did NOT recur; the edits applied normally in the main thread.
- The old guard denied a plain read-only `ls ... 2>&1` of the store mid-session, reproducing the reported defect first-hand before any fix was written.

STORE LAYOUT LEARNED: the v2 store is git-ref-backed at refs/heads/_ledger. <repo>/.git/ledger is EMPTY on disk. Thread state reads via `git show refs/heads/_ledger:threads/<id>.json`.