---
Status: accepted
Date: 2026-08-14T09:01:27.795Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0421. The phase authority is keyed to its target, and an unmapped target halts

## Context

C1 makes phase-parity enforce call sites rather than accepting assignment as a substitute for entry. The gate had been green on main all along precisely because it accepted assignment, so C1 adds a capability rather than fixing a violation. With more than one workflow now under the gate, the checker needs a rule for a target it has no phase model for.

## Options

- Judge an unmapped target against a default model - rejected: judges a workflow against a model it never owned
- Skip an unmapped target silently - rejected: a new workflow would go ungated with no signal
- Halt on an unmapped target - chosen

## Outcome

The phase authority is keyed to its target. A target with no declared model halts rather than being judged against a model it never owned, and a duplicate declared title halts too. This turns the addition of a new workflow into a loud failure that demands an explicit model, instead of a silent pass. The census that supports it was widened on two axes after review found it scanning a single pinned path and blind to template literals.
