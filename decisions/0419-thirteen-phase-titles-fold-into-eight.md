---
Status: accepted
Date: 2026-08-14T09:01:11.491Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0419. The thirteen phase titles fold into eight, and Prepare joins Prep rather than Probe

## Context

C1 implements the 13-to-8 phase collapse the SPEC absorbed from 0338. The fold is not mechanical: several source titles could defensibly land in more than one target, and the choice changes what a live run reports for whole regions of its execution.

## Options

- Prepare folds into Probe - rejected: Decompose is called between Prepare and Probe, so this would leave that region reporting as Decompose
- Prepare folds into Prep - chosen
- Keep thirteen titles and defer the collapse - rejected: the SPEC entangles the collapse with the rehost because both change the same call sites

## Outcome

Plan, Plan review, Parallelize and Prepare fold into Prep; Reconcile folds into Probe; Waves folds into Execute; Boundary folds into Integrate. The resulting eight are Decompose, Execute, Integrate, Prep, Probe, Remediate, Resume and Ship, confirmed live by the phase-parity verb reporting exactly those eight with zero dead titles. Prepare goes to Prep specifically because Decompose is called between Prepare and Probe; folding it into Probe would have left that region of a real run reporting as Decompose.
