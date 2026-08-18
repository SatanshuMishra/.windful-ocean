---
Status: accepted
Date: 2026-08-18T01:19:29.421Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0549. Waves 4 and 5 found four substrate gaps; three are fixed, the effort dial is a SPEC defect

## Context

All four wave 4 and 5 units completed in parallel worktrees and independently surfaced the same four defects, none of which the readiness audit predicted. First, the substrate created .claude/lib/mitosis/agent-specs/ inside the engine source root without teaching determinism-lint.mjs about it, so its closed census correctly halts rather than guessing whether engine source moved there, taking determinism, phase-parity and dispatchable-agent-schema-capable down with it - 18 failures on the substrate's own parent commit. Second, canonical-config-dir.mjs resolves through git commondir, so from a linked worktree the generator resolves to the PRIMARY checkout: a bare write would have overwritten the live global roster, and a bare --check reports zero specs and exits 0, a vacuous pass. Third, resolveSkillPointer requires plugin:skill and resolves through installed_plugins.json, so decision 0503's body-pointer channel does not exist for project-local skills - mitosis at 14200 bytes is too large to preload and cannot be a generated pointer. Fourth, the SPEC section 5b effort dial is not expressible: renderFrontmatter emits only name, description, tools, model, color, skills and mcpServers, effort is a dispatch-time argument, and no agent file on disk carries such a key.

## Options

- Fix all four inside the wave units that found them
- Fix the substrate defects in the substrate unit and record the effort dial as a SPEC defect
- Widen renderFrontmatter to carry effort so section 5b becomes satisfiable
- Exclude agent-specs from the determinism census rather than scanning it

## Outcome

The three substrate defects are fixed in the substrate unit that caused them, not in the units that found them, because acceptance is a ceiling and every wave unit had determinism-lint in its must-not-touch set. agent-specs is classified as SCANNED engine source rather than excluded: a spec containing Date.now would make its generated body differ on every run, which is exactly the drift the check exists to catch, so excluding it would create a blind spot inside the mechanism itself. The worktree resolution hazard is discharged by scoping every generator call with explicit store and agents paths; all four units did this and the live roster was verified untouched. The pointer gap is discharged for delivery-lead by a body instruction naming a repo-relative path, which carries no version segment and therefore cannot break on a plugin upgrade - 0503's actual hazard does not apply, though the rule now has a known hole for large project-local skills. The effort dial is recorded as a SPEC defect rather than fixed: section 5b assigns verifier a deliberate low that the platform cannot carry, so that dial is decorative. Widening renderFrontmatter was rejected because no evidence was found that agent frontmatter supports the field at all, and inventing a key that is silently dropped is worse than an honest gap. A fifth finding is filed: the local greens for determinism, phase-parity and dispatchable-agent-schema-capable on every wave branch are FALSE, because from a worktree those gates resolve the primary checkout and censused main rather than the branch.
