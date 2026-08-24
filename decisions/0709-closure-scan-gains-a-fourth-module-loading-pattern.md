---
Status: accepted
Date: 2026-08-24T07:53:39.297Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0709. The import closure is recomputed under a fourth module-loading pattern, superseding two SPEC classifications

## Context

U2's acceptance criterion failed: from a fresh clone, importing the engine entry point exited 1 on a module not found. Root cause is a fourth module-loading form the closure scan does not name - an eager computed CommonJS require, where the specifier is a module-scope constant rather than a literal in the import statement. It has exactly one production call site in the engine, and through it the entry point reaches two census modules the SPEC classified as host-only. Those two carry no host-path literals of any kind, so carrying them raises no publication-gate exposure. The SPEC and the plan are frozen and neither file is edited.

## Options

- Carry the newly-reachable modules, since the SPEC's own rule is that the recomputation wins over its list
- Edit the gate modules to drop the census verbs, removing the reachability at its source
- File the failure as a new unit and ship the import unit with its criterion unmet

## Outcome

Carry them. The SPEC states the recomputation wins over its own list, and the classification being overridden was itself produced by an instrument missing the pattern the code actually uses, so the recomputation was never in real conflict with a measurement. The same reasoning was already applied to five statically-reachable modules the SPEC marks for cutting, so this is consistency rather than a new rule. The instrument is fixed and the whole closure recomputed rather than the four known modules being added by hand, because a hand-derived list cannot prove itself complete. Editing the gate modules is production-logic surgery that belongs to a later unit, not to an arrangement step, and is refused here.
