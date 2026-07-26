---
Status: accepted
Date: 2026-07-26T20:23:02.111Z
Thread-Id: 01KYERGSD9QA9XC6QD4XPM8R37
---

# 0007. Suspected guard-scope defect refuted; CLAUDE_PLUGIN_DATA is delivered and the store is protected

## Context

The thread's top open risk asserted a SUSPECTED defect: that hooks may not receive CLAUDE_PLUGIN_DATA, so resolveLedgerRoots would fall back to only <repo>/.git/ledger (which is empty) and the guard would protect nothing. An earlier probe had returned only that empty path. Verification on 2026-07-26 refutes this.

Evidence. (1) Live in-situ measurement: a Bash command naming ONLY the plugins/data ledger-worktree path, and never naming <repo>/.git/ledger, was DENIED by the live 0fe1c02 guard. That guard matches roots by literal substring, so the denial is only possible if a <DATA>/<projectKey> root was in the protected set. That root exists solely when CLAUDE_PLUGIN_DATA is set (hooks/lib/ledger-roots.mjs:7-10). This reproduced twice in the orchestrator's own session, independent of the verification agent. (2) The env | grep proxy reports the var absent, but that proxy is INVALID: CLAUDE_PROJECT_DIR and CLAUDE_PLUGIN_ROOT are likewise absent from a Bash tool env yet hooks demonstrably receive them (hooks.json:5 substitutes ${CLAUDE_PLUGIN_ROOT} and the hook runs). (3) hooks/lib/ledger-roots.mjs is BYTE-IDENTICAL across 0fe1c02 and b0e1079, so scope was never broken by, nor fixed by, the guard branch.

The earlier probe was measuring the env-absent fallback path, not the live hook environment.

## Options

- Treat the defect as real and rewrite resolveLedgerRoots to stop depending on CLAUDE_PLUGIN_DATA
- Verify empirically before changing anything, and close the risk if refuted
- Merge b0e1079 first on the assumption it fixes scope, then re-measure

## Outcome

Verify-first was chosen and the hypothesis is REFUTED. CLAUDE_PLUGIN_DATA IS delivered to hook processes; when present the protected roots are <DATA>/<projectKey> plus <repo>/.git/ledger, and the real store at <DATA>/<projectKey>/ledger-worktree is a child of the first, therefore protected today. No scope fix is needed and none should be written. <repo>/.git/ledger is confirmed empty and vestigial, not data loss. The residual, downgraded from defect to latent fragility: ledger-roots.mjs:7-8 silently drops the only real root if the var ever goes missing, and pre-tool-use.mjs returns allow on an empty root set, so protection would vanish with zero signal. Prefer deriving the data root from CLAUDE_PLUGIN_ROOT or denying loudly. Separately confirmed uncovered by BOTH guards and NOT addressed by b0e1079: ref-level destruction (git update-ref -d refs/heads/_ledger, git branch -D _ledger) against the authoritative ref, and deletion of <repo>/.git/worktrees/ledger-worktree.
