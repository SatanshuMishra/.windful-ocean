---
Status: accepted
Date: 2026-08-17T06:25:38.931Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0511. Resolve the canonical roster by requiring two independent derivations to agree, and halt when they do not

## Context

The agent-schema gate resolved the roster two directories up from its own module path, so running from any of the 20 worktrees censused that worktree's frozen roster instead of the live one. A single replacement derivation was available two ways, and each has an environment where it is silent or wrong. The git common directory of the checkout owning the module is structurally worktree-invariant, but a GitHub Actions runner has no home configuration at all. The realpath of the live agents symlink is the configuration by definition, but alone it does not make the answer independent of where the module sits. A third option, anchoring git discovery to the process working directory, is actively unsafe here because the library symlinks into the primary checkout and is therefore reachable from any project, which would let an unrelated repository veto the answer.

## Options

- Keep the module-relative expression
- Derive from the git common directory alone
- Derive from the live agents symlink realpath alone
- Require both derivations to agree and halt otherwise
- Anchor git discovery to the process working directory

## Outcome

Require both derivations to agree. Disagreement halts naming both answers; neither resolving halts naming both probes. CI validated the pairing immediately rather than in theory: the runner carried only the git derivation, while locally the symlink derivation is what makes the result independent of the module's location. The resolver returns the file's existing halt shape rather than throwing, so the eagerly evaluated default target stays cheap and cannot throw at import, and the gate reports an unresolved roster through its existing unresolvable exit path with the reason preserved. The operator escape hatch remains the explicit target flag.
