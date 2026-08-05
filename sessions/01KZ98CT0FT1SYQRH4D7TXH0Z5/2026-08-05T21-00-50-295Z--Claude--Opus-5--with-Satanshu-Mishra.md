Step 2 shipped and ratified. Two commits on fix/gate-hardening-followups: ca25db1 (the three documents) and 8c49358 (a gitignore negation).

WHAT SHIPPED

c1 - docs/security/bash-gate-threat-model.md, 102 lines, ten sections: scope, assurance level, adversary model, G1-G5, reasoned non-goals, accepted residual risks, definition of done, escalation control, known weaknesses of the design, references. Status line records ratification on 2026-08-05 by the repo owner, so the gate that held gate code is now passed; the definition of done and the escalation control govern from here.

c2 - a four-line carve-out appended to .claude/rules/common/security.md, and a nine-line .claude/hooks/CLAUDE.md. The registry.json append was deferred (decision below).

THREE FINDINGS THAT CHANGE LATER WORK

1. The plan's citation for the fail-open is wrong AND understates it. RESEARCH-AND-PLAN.md cites block-destructive-bash.sh:26-28; lines 26-28 are reason="" and the git regex definitions. There are THREE distinct paths that allow without forming an opinion, all re-verified against the live file: 4-7 (the case prefilter exits 0 on any input missing all its substrings, before any analysis runs), 9-16 (the python3 extractor swallows any exception into an empty cmd, then [ -z "$cmd" ] && exit 0), and 96 ([ -z "$reason" ] && exit 0, the intended no-opinion path). c3 must cover all three; the threat model's section 6 row 3 now names each.

2. Appending G1-G5 to registry.json fails CI immediately. Proved empirically in a scratch copy: scripts/invariant-coverage-check.mjs validates EVERY file in docs/invariants/coverage/ against the full registry id set, so five new ids produce "missing invariant id(s): G1, G2, G3, G4, G5" on all 22 existing artifacts. That job runs on push, not only on pull_request, so the break lands on the next push rather than at PR time.

3. .claude/hooks/CLAUDE.md was silently uncommittable. .gitignore:7 blanket-ignores **/CLAUDE.md with a single negation for /.claude/CLAUDE.md. The first commit dropped the file without failing. Untracked, it would be absent from every mitosis worktree, every clean checkout and the PR diff - exactly where an agent editing the gate needs it. Fixed by a second negation at .gitignore:9, same idiom as the existing one.

TWO WORDING DEFECTS CAUGHT AND FIXED BEFORE RATIFICATION

Both were the same error: prohibiting a category where only an excess was meant, and both originated in the orchestrator's dispatch prompts, not in the subagents.

- security.md said the gate is governed by the threat model "not by the protocol above". Read strictly that exempted the gate from Mandatory Security Checks and Secret Management too. Narrowed to override only the Security Response Protocol's escalation ordering, steps 1 and 3, naming what still binds.
- .claude/hooks/CLAUDE.md said "YOU MUST NOT ... harden it as if it were a security boundary", which reads as a ban on hardening. The threat model's definition of done item 1 REQUIRES closing G1-G5, and c3 is itself a hardening task, so a session dispatched to c3 could have read that line as a stop sign on its own assignment. Narrowed to forbid hardening beyond G1-G5 and boundary-treatment, while stating that G1-G5 hardening is required, not discouraged.

A harness security warning fired on the second subagent for self-modification (unauthorized instruction content weakening a security protocol on a live guard). Assessed rather than waved through: the target files were user-directed by c2 and the framing follows ratified decision 0248, but the carve-out wording was the orchestrator's inference and it had genuinely come out over-broad. It surfaced defect one above. Both narrowings were reviewed by the user before ratification.

PROCESS NOTE

Delegation held throughout: two technical-writer subagents for c1, two more for the narrowings and the amendments; the orchestrator read, verified and dispatched. Every in-repo citation was re-derived against the live tree, including docs/superpowers/specs/2026-07-27-centralized-pr-creation.md:65 and the three fail-open ranges. Pre-existing working-tree drift (settings.json, .zshrc, two sounds files, two .bak files, the context7-mcp skill) was left untouched and excluded from both commits.

NOT DONE

registry.json carries no G1-G5 entry. Nothing was pushed. No gate code was written, which is correct - c3 starts there.