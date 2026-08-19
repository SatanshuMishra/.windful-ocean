---
Status: accepted
Date: 2026-08-19T03:07:34.739Z
Thread-Id: 01M0BV3M8GKVP5HSQKB19Z9WW8
---

# 0620. Never collapse the twin plugin data roots: convergence is per-project and one project would lose 70 records

## Context

Every cached plugin has a duplicate data root because the desktop application spawns the bundled CLI with a per-plugin directory flag that the harness registers as a synthetic marketplace, alongside the normal marketplace install. The flag is emitted by the signed application binary, so no dotfile, alias, plist or settings key composes it. For this project the twin logbook roots proved harmless - git worktrees of one ledger ref, one an ancestor of the other, 614 files each and every number byte-identical. The tempting cleanup is therefore to uninstall one registration and collapse the pair.

## Options

- Uninstall one registration to collapse the twin roots
- Leave both roots in place and never collapse them
- Merge the roots' contents and then collapse

## Outcome

NEVER collapse them, and never merge their contents. Convergence is per-project and incidental rather than structural: a second project on this machine holds 156 decisions in the marketplace root against 86 in the twin, so 70 records exist in one root only and uninstalling a registration would strand them. There is also no local fix available even if collapsing were safe, because nothing user-editable composes the flag. Measure a given project's two roots before drawing any conclusion about it, and never generalise this project's clean result to another. The correct posture is to leave both roots alone, resolve the store from the running server rather than by picking a path, and treat the duplication as an upstream defect filed against the harness with a defensive de-duplication suggestion for the plugin.
