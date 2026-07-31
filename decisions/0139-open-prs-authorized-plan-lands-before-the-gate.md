---
Status: accepted
Date: 2026-07-31T00:14:27.566Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0139. PR opening authorized on the public repo; the invariant plan lands before the coverage gate

## Context

0138 left PR opening unauthorized on this thread and the brief required asking exactly once before any branch was proposed. The repo SatanshuMishra/.windful-ocean is public and carried zero open PRs. Separately, all 12 records in docs/invariants/registry.json on feat/invariant-coverage-gate cite source "2026-07-30-two-track-invariant-plan.md" - a bare filename whose only copy lives on the unlanded docs/two-track-invariant-plan branch, so landing the gate alone would reproduce the 0128 dangling-citation shape on main.

## Options

- Open PRs through pr-create, landing docs/two-track-invariant-plan before feat/invariant-coverage-gate
- Open PRs but land the gate alone and accept 12 dangling source citations on main
- Merge locally and push without PRs, leaving the invariant-coverage job unexercised on a pull_request event
- Hold all landing and go straight to B-6

## Outcome

Authorized. PRs are opened through the centralized pr-create tool, one per MSP, and docs/two-track-invariant-plan lands FIRST so every registry source resolves to a tracked path before the gate that cites it reaches main. Merge stays human-gated. The registry source values must additionally be rewritten from the bare filename to the full tracked path docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md on the gate branch; leaving them as bare filenames would keep the citation unresolvable even after the plan lands.
