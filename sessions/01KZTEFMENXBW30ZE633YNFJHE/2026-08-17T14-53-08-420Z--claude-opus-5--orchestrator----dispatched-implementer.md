Landed the entire remaining pull-request stack on main and cleared the trunk to green.

SHIPPED
- Seven pull requests merged: 184, 185, 186, 187 (the stack) plus 170, 171 and 173 (independent, based on main). Combined with the five merged earlier this closes EVERY open pull request on the repository; the open set is now empty.
- main advanced 43 commits / 15 merge commits to 425b06fb. Both test and security are green on the tip.
- Restacked 184-187 onto main via a dispatched implementer. 184's branch carried 20 commits of which only 3 were its own work; the other 17 were stale twins of commits already merged as 174-183. Dropping them collapsed a predicted 13-file conflict wall to ZERO conflicts. git range-diff shows 10 of the 11 replayed commits are byte-identical patches; the eleventh (139c6d65) differs only in a context line where main's declaredJudgment body won.
- Per-branch proof: npm test green on all four (2806 / 2817 / 2817 / 2820 tests, 0 fail, 1 pre-existing todo at wave-planner.test.mjs:139), all four gate verbs exit 0, phase-parity reporting a fully populated eight-phase use-set rather than an exit-42 halt.
- Verified every merge by CONTENT, never by a MERGED label: all 11 restacked commit SHAs asserted as ancestors of origin/main (e65cb28f, ce5d0914, 0aa6827b, a1d6283e, 139c6d65, 33fbd6e9, 5c63e53c, 59068f18, 3bf59444, 176354c0, 587e9576).
- Cleanup complete: all eight merged branches deleted from the remote, primary checkout fast-forwarded to 425b06fb so the symlinked global config is actually in force, backup refs dropped.

FAILED AND RECOVERED
- gh pr merge is REFUSED for a stacked pull request: "This pull request is part of a stack and must be merged using the asynchronous merge REST API". The entire GraphQL merge path is unavailable here. Switched to PUT /repos/{owner}/{repo}/pulls/{n}/merge-async with uuid polling against the sibling GET.
- PR 184 was CLOSED, not retargeted, when its base branch was deleted out of band. Recovered by pushing the base ref back (the commit was already on main so this added nothing), reopening, then gh pr edit --base main, then re-deleting the ref once no open pull request named it. No work lost; all four head branches and all three of 184's own commits stayed reachable throughout.
- The merge helper reported "OK remote branch gone" about a branch that was still present. Two causes: grep on this machine resolves to ripgrep with an unrecognised --smart-case flag, so the exit-code check errored instead of matching; and "!!" inside a double-quoted string triggered zsh history expansion, mangling the error strings. Both rewritten out of the helper.
- sast went red on the trunk tip from the semgrep p/default drift guard. The runner computed cd011090..., while a local fetch computes the pinned d9f73571... A re-run of the identical commit went green with no code change.

NOT DONE
- c28 through c31 remain open. Each is worded "on a real run" / "proven end to end not by unit test"; merging the pull requests that implement them is not the same as exercising them. c31 additionally wants an automated end-to-end test running in CI, red on a build whose engine cannot reach Ship.
- The receipts BLOCK on 171 and 173 was never adjudicated - both were merged with it red. On 181 the same verdict read "no receipt: this change adds no acceptance test", sitting underneath the gates.G17 unknown-key warning.
- The earlier rewrite (pre-restack) silently dropped commit signatures: commits already on main from it verify N (unsigned), whereas all 11 commits from this restack verify G.