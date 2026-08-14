Closed the thread's remaining build work and shipped it to main.

SHIPPED
- c14 struck (0411). The governed launcher claimed to be a gate but nothing made it the sole entry point; anyone can type claude directly. Only the convenience half survives, unbuilt.
- c3 (15d8dca): permissions.deny pruned 47 to 36 in both the tracked and the live settings.json. Removed git -c and git --config-env (they blocked the agent signing its own commits), supabase db reset (it defeated the ratified local-container carve-out), curl/wget/nc/http/xh (they blocked ordinary work while scp, rsync, openssl, node and python3 reached the network undenied), gh pr review (it cannot land code while merge stays denied) and assign_copilot_to_issue on both github aliases. Every merge gate, the pr-create centralization, default-branch pushes, force-push, reset --hard, the remote supabase commands and all 15 credential read guards were kept. Ask rules were already zero on all three surfaces.
- c4 (510b58a): permissions.allow widened 32 to 62 in both files, which now carry identical sets. Nine tool-level grants plus twenty per-server MCP rules. settings.local.json truncated from 213 entries to zero.
- c9 (5ae9c24): session-config-drift-check.sh and its orphaned test deleted; the bash gate's dead release-tree tokens (releases, current, local, CUTOVER, LIVE, .cutover, the pre-cutover aside form) pruned; the dead nested ~/.claude/.claude/settings.local.json removed after backup. Gate suite 248 of 248, down from 278 by exactly the 30 cases asserting deleted paths.
- c11 and c15 (PR #96, merged 2026-08-14T04:47:09Z): branch renamed fix/release-tree-immutability to feat/permissions-only-autonomy, origin/main merged in, full suite run at the merge boundary (1959 pass, 0 fail, 1 pre-existing todo in mitosis wave-planner which the diff does not touch), pushed and opened through pr-create with no human hands. 57 files, 33 insertions, 12481 deletions.

WHAT WENT WRONG, AND WHAT IT COST
- The first c4 subagent dispatch was DENIED by the auto mode classifier. That denial was the most useful event of the session: it revealed the session was running in auto mode, where M25 measured that broad allow rules are silently discarded. The ratified tool-level allow would have been inert in the mode actually in use. Recovered by having the user move off auto mode and writing both rule shapes (0412). Did not route around the denial with a direct Edit, which would have been the exact behaviour that tripped the Wave 0 security flags.
- Characterised the logbook PreToolUse hook's purpose from its name and matcher without reading its handler, and was called on it. Reading it showed the handler is narrow and well-behaved; the fail-closed defect is entirely in the wrapper. The correction changed the outcome: R6 moved to the plugin repo (0413) instead of being papered over with a config-side workaround.
- Told the user there were 20 credential read guards; there are 15. No edit was affected.
- Asserted that deny survives bypassPermissions, sourced from a SPEC line rather than a measurement. The documentation is ambiguous and no experiment covers it. Walked it back and it is now an open risk and a Not-verified line on PR #96.
- Launched npm test piped through tail, which buffers, so no interim progress was visible. Result unaffected.

POST-MERGE
Found local main 8 commits behind while verifying the merge. Because the ten ~/.claude entries are symlinks into the WORKING TREE, a git checkout main at that moment would have silently reverted the live global config to pre-merge state. Fast-forwarded local main to 3e1d267 with git fetch origin main:main, without switching branches. All ten symlinks resolve and live settings read 62 allow / 36 deny.

Backups in the session scratchpad: settings.json.live.bak, c4-tracked-settings.json.bak, c4-live-settings.json.bak, c4-local-settings.json.bak, nested-settings.local.json.bak.

Nothing left running. The remote branch feat/permissions-only-autonomy is merged but not deleted, left for the human.