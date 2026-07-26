FIRST SESSION WRITTEN INTO THE v2 STORE. Resumed by explicit slug from the v1 archive; the recorded next step (the archive move) was accurate on arrival, unlike the previous session.

WHAT SHIPPED
- CRITERION 2 MET. The v1 ledger moved from .claude/ledger/ to .claude/ledger-archive-v1/ and frozen with chmod -R a-w. Full evidence in decision 0001.
- CRITERION 4 MET. Seven v2 threads hand-authored and seeded: ledger-v2-archive-and-seed (left active, this thread), agent-roster-gap-resolution, continuity-plugin-realworld-test, mitosis-frontier-default, mitosis-git-actions-robustness, mitosis-preflight-hardening, mitosis-resilience-implementation. Each carries its v1 completion criteria with real done-state, an external_ref to its archived v1 thread file plus spec/analysis refs, and a full spine. Six parked at paused; rebuild_index reports 7 threads / 7 by_slug / 7 resumable.
- Decisions 0001 (archive move) and 0002 (seed set limited to seven) recorded.

METHOD NOTE WORTH KEEPING
The graphify Stop hook fires at the end of EVERY turn and had been writing into .claude/ledger/graphify-out/manifest.json. A before-digest taken in one turn and verified in the next could therefore have been corrupted by an interleaved write. The digest, the move, the byte-verification and the freeze were all executed inside ONE uninterrupted turn to close that window. Any future freeze of a live directory should do the same.

WHAT FAILED AND WHY
- One update_thread call was REJECTED with CapViolationError: spine.open_risks item exceeds 300 chars (mitosis-git-actions-robustness). The whole call is rejected, not truncated, so nothing partial was written. Retried with the long risks split into shorter items and it landed. Spine list items must stay under 300 chars each.
- A read-only verification command (grep -l piped to xargs basename over the store's threads dir) was BLOCKED by the plugin's PreToolUse guard as "a mutating Bash command targeting the session-continuity ledger store". It was not mutating; the guard pattern-matched it. Two consequences: verify the store through the MCP tools, not the shell; and the guard message still reads "use the mcp__ledger__* tools", the PRE-fix spelling, which independently re-confirms the installed plugin is still 3b9de99 and not the published 0fe1c02.
- The hook-matcher fix remains BLOCKED. Not re-attempted this session; it needs the user to approve the edit directly at the prompt.

DRIFT CORRECTED INTO THE NEW SPINES (v1 was stale on both)
- mitosis-preflight-hardening's commit gate pointed at thread claude-config-repo-native-architecture, which is status done in the archive. The v2 spine now says re-verify whether the gate still holds rather than asserting a live gate.
- mitosis-frontier-default's live ghu_ Copilot token risk was owned by thread pr3-remediation, which was NOT carried into v2. The v2 spine now says re-confirm ownership before any push.

CARRIED OPEN
- The token itself is still untracked and unignored in the working tree on a public repo. In no commit.
- bindings / by_branch are 0. vcs_ref is stored per thread but no branch bindings were created (bind_branch never called). Not required by any criterion; branch lookup will not resolve until it is run.
- The three uncarried threads' open items exist only in the frozen archive. See decision 0002.
- The repo working tree is unchanged all session: the same 10 entries, byte-identical before and after the move. Nothing was committed or pushed this session.

RUNNING STATE
None. No subagents, no background shells, no workflows.