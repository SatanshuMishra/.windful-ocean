---
Status: accepted
Date: 2026-07-28T20:57:33.925Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0093. The two merge-boundary layers are not independent: both exec the same file inside the repo under management

## Context

Independently verified this session. The authoritative layer-1 gate in SKILL.md is INTACT on main, with unhedged fail-closed wording ("Dispatch ONLY if the merge-boundary preflight exited 0"), and merge-boundary-preflight.mjs is byte-identical to 457d6fa with report.passed requiring positive proof of every required invariant. No third enforcement surface was ever lost. BUT ~/.claude/lib is itself a symlink into this repository, so BOUNDARY_PREFLIGHT_CLI (/Users/.../.claude/lib/superpowers-parallel/merge-boundary-preflight.mjs) resolves INSIDE the repo being merged into - precisely the condition the step 7 prompt forbids. The invokedAs check cannot detect this by construction: it is string equality on the UNRESOLVED path, and a poisoned gate has the identical path string. A single write to that file defeats layer 1 and layer 2 simultaneously.

## Options

- Have the preflight self-report realpath(fileURLToPath(import.meta.url)) as a distinct field and halt in both layers when it resolves under repoRoot
- Relocate the gate binary outside every mitosis-managed repo
- Pin the gate by content hash stored outside the managed tree
- Accept the coupling and rely solely on the server-side ruleset

## Outcome

Rated MEDIUM by security review, not CRITICAL: landing the poisoning write requires passing protect-claude-config.sh (which covers the lib prefix and resolves realpath), and the authoritative control - the server-side ruleset requiring human review - is untouched by gate poisoning. This defeats defense in depth, not the boundary itself. NOT FIXED this session; needs its own MSP. Note the guard does NOT cover git worktrees at all, which materially weakens the "requires passing the guard" mitigation.
