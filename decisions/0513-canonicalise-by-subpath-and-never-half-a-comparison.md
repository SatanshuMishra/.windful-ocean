---
Status: accepted
Date: 2026-08-17T06:56:04.424Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0513. Parameterise the canonical resolver by subpath, and never canonicalise one side of a comparison

## Context

Extending the two-derivation canonical resolver from the roster to the engine-source roots looked like it wanted a shared helper returning a checkout ROOT that each caller appends its own subpath to. That factoring does not survive contact. The live-configuration derivation resolves a symlinked home entry and yields a DIRECTORY, so producing a root means stripping a trailing config-and-entry suffix, which introduces an assumption the existing code does not make and changes the roster resolver's halt behaviour whenever the live entry realpaths somewhere without that suffix. Separately, the phase-parity gate shares the same engine-source root function while reading its declared phases from a target that is still module-relative. Canonicalising the shared function wholesale would have compared the primary checkout's engine source against a worktree's phase declarations, producing a false red on every branch that touches phases.

## Options

- Extract a shared helper returning the canonical checkout root
- Parameterise the existing directory-level resolver by subpath segments
- Canonicalise the shared engine-source root function for all its consumers

## Outcome

Parameterise at the directory level, not the root level: one resolver takes the anchor plus the subpath segments and keeps the two-derivation agreement check intact, with the roster asking for the agents directory and the engine census asking for the engine library directory. It lives in its own module so both importers depend on it and no cycle forms, and the original module re-exports its prior surface unchanged. Phase-parity keeps its branch-local scope explicitly, because canonicalising one side of a comparison while the other stays branch-local is the same defect pointed the other way. Whether phase-parity should become canonical is a separate question that also requires reading canonical phase declarations, and is filed rather than answered here.
