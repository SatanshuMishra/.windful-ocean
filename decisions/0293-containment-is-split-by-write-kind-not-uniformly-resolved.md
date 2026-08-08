---
Status: accepted
Date: 2026-08-08T07:03:29.263Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0293. Containment is split by write kind, because link writes do not follow the final path component and content writes do

## Context

Round 2 shipped a containment check at all six cutover write sites and still failed review, because isInside at paths.mjs:50-56 compares lexically with no realpath: with local/ made a symlink to an outside directory, applyCutover returned applied and wrote notes outside the config root. The round 3 instructions I wrote restated the invariant as resolve both sides through symlinks before comparing, at every site. Measured during implementation, that restatement is itself wrong, and wrong in the opposite direction. rename, symlink and unlink do NOT follow the final path component, while copyFile and writeFile DO. Every depth-1 entry that the cutover exists to replace is, before the cutover, a symlink pointing outside the config root into the checkout. So a uniformly resolving check would resolve those entries to their pre-cutover targets, find them outside the root, and refuse, refusing precisely the state the verb was built to change, on every real machine. The unsound check and my correction to it were both wrong; only measurement distinguished them.

## Options

- Split containment by write kind through one table that fails closed on an unknown kind: container-resolution for link writes, full resolution for content writes - ADOPTED. Resolve both sides fully at every site, as the round 3 instructions literally said - rejected on measurement, because it refuses every real deployment. Leave containment lexical and rely on the verb refusing to run outside a config root - rejected, because that is the unsound check round 2 already shipped. Change the shared isInside to resolve and adjust the four other consumers - rejected, because the fourteen existing call sites are correct under lexical semantics and changing them serves nothing here.

## Outcome

Adopted. Containment dispatches on what the write actually does to the final component. Link writes (rename, symlink, unlink) are proven against the resolved CONTAINER, since the final component is the thing being replaced and its current target is irrelevant. Content writes (copyFile, writeFile) are proven against the fully resolved path, since the write follows the link. The dispatch runs through one table that fails closed on an unknown kind, so a future write kind is refused rather than silently defaulting to the weaker rule. cutover.mjs no longer imports isInside at all.

The shared isInside keeps lexical semantics, and its fourteen call sites across capture, validate, install-bootstrap and promote are unchanged and were enumerated before the helper was touched, so they hold by construction.

The general lesson, and the reason this is worth a record rather than a code comment: an invariant can fail in two directions, and the second is easier to miss because it looks like rigour. Round 2's check was too weak to catch a symlink; my correction was too strong and would have refused every legitimate run. Neither was distinguishable from the other by reading, because the difference is a property of the syscalls rather than of the design. An invariant that constrains a filesystem operation must therefore be stated against what that specific operation does, and tested against a realistic pre-state, not only against the failure it was written to prevent.
