The user rejected the thread's premise outright and directed a full strip to permissions only. This session executed the demolition and re-based the plan on it.

SHIPPED
- 687c07e: removed the Layer 0 sandbox block from tracked settings and unregistered all five architecture hooks (both converge.mjs convergence hooks, protect-claude-config.sh, checkpoint-worktree.mjs, trash-rm.mjs). Dropped PYTHONDONTWRITEBYTECODE, which existed only for the release-tree immutability contract.
- c8a1b9a: deleted scripts/config in full, .claude/lib/reversibility in full, the three architecture hook files and their five tests, and the scripts/config test glob in package.json. 51 files. npm test exits 0 with zero failures, run twice.
- Global ~/.claude/settings.json rewritten by the user from a generated copy: sandbox key absent, five hooks unregistered, permissions untouched. Verified by write probe (~/.claude went from Operation not permitted to writable), which is the real receipt, not the config key.
- Decisions 0407 (premise reversal), 0408 (allow is broad, supersedes 0396), 0409 (deny needs no replacement, supersedes 0401).
- Criteria: c6 (Layer 3) and c7 (Layer 4) struck under 0407. c3 and c4 rewritten to match 0409 and 0408, since their old text mandated the narrow-prefix approach that was just overturned. c15 rewritten to drop its Layer 0 framing. c17 inserted for the topology repair.
- Decision index pruned of everything 0407, 0408 and 0409 superseded: 0392, 0395, 0396, 0397, 0400, 0401, 0402, 0403, 0404, 0406. Files retained per the write-once rule. Standing risks rewritten, since most described code that no longer exists.

NEXT STEPS, IN ORDER. The ordering in c17 is load-bearing; reversing it destroys the global config.

c17, install topology:
1. Read scripts/install_config.sh and scripts/install-hooks.sh - the pre-release stow installers, which survived the deletion and already encode the target topology.
2. Re-point all ten entries from current/<entry> to the repo's .claude/<entry>: skills, agents, lib, workflows, hooks, rules, docs, sounds, CLAUDE.md, keybindings.json. Use ln -sfn, never bare ln -s, which descends into an existing directory and writes the link inside it - that mistake already happened once this thread.
3. Verify EVERY entry resolves into the repo (readlink plus a file probe per entry). This is the receipt; do not skip to step 4 on the assumption it worked.
4. Check ~/.claude/local/notes for user data that is not in the repo BEFORE deleting anything.
5. Then remove ~/.claude/releases, current, current.tmp, LIVE, local, and .cutover if present.
6. Confirm the registered hooks still fire now that they resolve through the repo rather than a release snapshot.

c3, prune deny per 0409. KEEP: merge gates (gh pr merge, mcp merge_pull_request) and pr-create centralization, both user-affirmed; default-branch pushes per 0399; git push --force/-f and git reset --hard; every secret and credential read; the remote supabase commands owned by the separate no-direct-db-access rule. REMOVE: supabase db reset, which the ratified local-container carve-out already permits; git -c and git --config-env, which existed only to stop bypass of gates that no longer exist and which today stop an agent signing its own commits; gh pr review. JUDGEMENT CALL needing the user: curl, wget, nc, http and xh are denied - they were network guards duplicating the sandbox that is now gone, and they block a lot of ordinary autonomous work, but removing them removes the last exfiltration friction. Also confirm no ask rules survive in settings.local.json.

c4, widen allow per 0408. Broad tool-level allow plus mcp__* coverage, and truncate settings.local.json so one-off rules stop accumulating. Verify the exact rule spelling against live behaviour rather than assuming a syntax.

CRITICAL for both c3 and c4: promotion is deleted, so ~/.claude/settings.json is now a hand-maintained file. Every permissions change must be applied to BOTH the repo's .claude/settings.json and the global file, or it will not bind. Nothing syncs them any more.

ALSO PENDING
- .claude/rules/common/hooks.md still carries the c10 rule text making bypassPermissions conditional on layers 0, 1 and 4 being live and asserted. Those layers are now deleted or struck, so as written that rule permanently forbids the mode - it now blocks the exact autonomy the thread exists to deliver. It must be rewritten alongside c3 and c4.
- c14 (governed unattended launcher) was deliberately left unstruck and needs a user ruling; it is launcher governance for the containment model and may belong with the struck c6 and c7.
- block-destructive-bash.sh is retained. Check it does not re-impose friction that c3 removes from the deny list, since it gates independently.
- The process deleting the six promoted entries is still unidentified and outside this repo. Restoring the direct-repo topology in c17 removes the surface it operated on, which may moot it; if entries keep vanishing afterwards, it does not, and it needs fs_usage as root.
- Two commits sit on fix/release-tree-immutability, unsigned via --no-gpg-sign. Retest signing now that the sandbox is gone before assuming that flag is still needed.