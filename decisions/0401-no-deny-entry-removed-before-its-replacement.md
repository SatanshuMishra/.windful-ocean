---
Status: accepted
Date: 2026-08-13T19:53:54.130Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0401. No deny entry is removed until its replacement exists

## Context

The recorded ship order put c3 (prune deny to D1-D5, retire ask) before c5 (Layer 1 checkpoint) and c6 (Layer 3 gate), following SPEC section 6's numbered steps, which order by leverage rather than by safety. Reading the actual 47 deny entries at .claude/settings.json:43-89 showed the prune is a reclassification, not a deletion. Several entries do not disappear - their function migrates to machinery that does not exist yet. curl/wget/nc/http/xh are D1's egress side, but D1 as amended guards egress carrying credential-shaped data, not all egress, so they belong in the gate's P1 predicate. git push --force belongs in P5 because R5 guards only force-push to a shared branch. git reset --hard belongs to D6's checkpoint. Separately c3's own wording requires converting hook ask branches to checkpoint-and-allow, and that checkpoint ships in c5. Pruning first opens a window with neither the deny nor its replacement in force. A second ordering fault surfaced in the same pass: sandbox is unclassified in scripts/config/manifest.mjs, so c8 landing before c12 would freeze it live permanently, and after c12 would be refused outright.

## Options

- Follow SPEC section 6's numbered step order as written
- Reorder so every replacement lands before the control it replaces is removed
- Collapse c3, c5 and c6 into one large MSP so no intermediate state exists

## Outcome

Reorder. The operating rule is that no deny entry is removed until its replacement exists, which makes every intermediate state over-restrictive but never under-restrictive. Ship order becomes c2/c12/c13/c10, then c5 and c8, then c6 and c7, then c3 then c4 then c9. c8 additionally must add sandbox to REPO_OWNED_KEYS in the same change, since neither the freeze path nor the post-c12 refusal path lets an unclassified key work. Collapsing into one MSP was rejected: it defeats the green-branch invariant the MSP split exists to hold, and produces an unreviewable diff. SPEC section 6 is not amended - it is ratified, and its order is a leverage ranking, not a dependency graph.
