---
Status: accepted
Date: 2026-08-11T16:29:00.201Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0338. The eight-phase collapse is re-adopted, re-derived against today's engine, with four amendments

## Context

The diagram page asserted a fixed 13-phase sequence while naming only three and leaving "Phases 04-13" as a placeholder; I wrongly concluded no new phase model existed. The user directed a git-history search, which found it: docs/superpowers/specs/2026-07-30-mitosis-core-rebuild.md section 4, on branch docs/mitosis-core-rebuild-spec, never merged to main - which is why a working-tree search missed it. It collapses the engine's 13 declared titles to eight. Because it was authored against mitosis.js at 4,851 lines and the file is 5,515 today, the user directed a full re-audit before adoption. Two parallel audits re-derived every row and tested whether the eight still cover the engine. They do: every phase: literal resolves to one of the 13 declared titles, every new dispatch attaches to an existing one, and the phase-parity gate added in 12053dc makes an undeclared phase structurally unreachable.

## Options

- Re-adopt the eight-phase set with four amendments - chosen
- Adopt it verbatim as authored in 2026-07-30
- Redesign the phase model against the Node host from scratch
- Keep the diagram page's unenumerated 13-phase placeholder

## Outcome

The eight-phase set is re-adopted: Probe, Decompose, Prep, Execute, Integrate, Ship, Resume, Remediate - six on the happy path, Resume only on relaunch, Remediate only on failure. The SPEC must RE-ADOPT it deliberately, since SPEC B's preamble disclaims all citation authority from the 2026-07-30 document. Four amendments carry: (1) name the CI-to-green loop under Ship/Remediate - commit 4fd03c2, +481 lines, the largest addition since baseline; (2) drop "survives as a needsPlan escalation" - no such construct exists, cite the plan-artifact-missing park at :4817 instead; (3) soften "Parallelize's edges become a verb" to the edge-derivation sub-step only, since semantic discovery, wave computation, lane routing and engineArgs assembly have no verb equivalent, and record derive-clusters.mjs as dead to the engine; (4) mark "Prep" a design-level label with no code counterpart, spanning Prepare plus only the frontier slice of Branch. Two corrections: the Plan-review deletion rationale "auto-approves by construction at :889-899" is false as cited and overstated in substance - the real construct is resolvePlanReview at :1191 and auto-approve is only a bounded second-pass fallback; and Boundary's mechanical claim holds but now lives in firstPassGate/recheckGate at roughly :1503-1531. Two fates already shipped in 12053dc: Final review is gone from the file and Shepherd is declared as Resume.
