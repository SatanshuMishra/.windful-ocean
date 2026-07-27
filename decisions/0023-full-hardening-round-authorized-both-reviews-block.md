---
Status: accepted
Date: 2026-07-27T00:48:33.159Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0023. Full hardening round authorized: both reviews returned BLOCK, and the locked allowlist, bill and corpus may be amended to close proven bypasses

## Context

Both criterion-4 reviews returned BLOCK at f95bdcb. Security: 4 CRITICAL, 3 HIGH. Code review: 2 HIGH, 5 MEDIUM, 4 LOW, nothing at CRITICAL, with the freeze on shell-tokens.mjs and the no-comments rule both verified clean. Every headline finding was reproduced by execution rather than by reading. The two reviews agree on the shape of the failure: the structural half of the control - tokenizer compensation, splitControl, redirect scoping, prefix stripping against destructive heads, find action flags, sed -i shapes, runGuardEntry fail-closed - held under direct attack, while the clearance logic that decides what counts as read-only leaks. Decision C justified sort, uniq, cut, tr, column, paste and join as stream filters with no file-write flags in common use; that premise is false for five of thirty-eight ALLOW_HEADS members. Every C1 to C3 remedy changes a table 0018 locked AND flips a case in the corpus commit 6 was forbidden to touch, so the orchestrator stopped and put the call to the user.

## Options

- Full hardening round amending the locked tables, bill and corpus
- Narrow the allowlist hard without new predicate code
- Fix only the findings that touch no locked artifact
- Stop and hand off

## Outcome

USER CHOSE THE FULL HARDENING ROUND; locked artifacts are amendable ONLY to close proven bypasses, never to re-open settled preferences, and A-H stay closed on every axis neither review falsified. Round scope, one commit per item, RED corpus extension first to preserve red-before green-after. From the security review: C1 sort, uniq, xxd, tree become CONDITIONAL on their output flags and yq is dropped outright, plus a positive write-capability audit of every remaining member; C2 sed leaves clearance entirely and sedAllows is deleted, since its write and execute powers live in the script body where no option parser can see them; C3 -c, --config-env, --exec-path, --namespace, --super-prefix, -p and --paginate leave the accepted git globals into the fail-closed catch-all, and --output, -O and --open-files-in-pager are denied across the sub-segment; C4 the oversize gate fails CLOSED in both directions - naming a root denies, otherwise ASK rather than allow, which keeps the bounding guarantee while removing the silent hole; H5 cwd tracking becomes MONOTONIC, closing failed-cd, subshell-cd and pipeline-subshell desync in one rule without needing separator information the frozen tokenizer discards; H7 isUnderRoot canonicalizes via realpath on the deepest existing ancestor while RETAINING the lexical check as an additional trigger. From the code review: the ampersand split is restricted to token-boundary ampersands so quoted and escaped literals stop being shredded, which is both a total bypass for roots containing an ampersand and an unbilled over-block; the PREFIX_WORDS branch must apply the obfuscation and trusted-dir checks BEFORE stripping, closing ./env cat ROOT/f; the group-opener strip becomes ITERATIVE, since 16000 leading parens inside the cap throw RangeError; O1 uses SINK_HEADS MINUS git and find, which restores the design's own FP-bill item 4 (cat ROOT/PROJECT.md then git status must not ask) without opening a real sink; scope inheritance from 0022 is KEPT and promoted into the bill with corpus cases pinning BOTH sides - ls ROOT ampersand rm -rf dollar-D denies (the security value the reviewer's corpus-only measurement could not see) and ls ROOT ampersand npm test denies (the over-block price); the ask verdict gains an observable-surface test through classifyPreToolUse; dead CONTROL_RESIDUE, the duplicated control set and helpers, and the one in-place push are cleaned up. H6 stays OPEN pending a factual answer on whether the PreToolUse input cwd tracks the persistent Bash shell. M8 ancestor deletion, L9 per-call git subprocess, and the unreadable-input deny of the sanctioned MCP path stay open and unauthorized. MERGE BLOCK STILL STANDS.
