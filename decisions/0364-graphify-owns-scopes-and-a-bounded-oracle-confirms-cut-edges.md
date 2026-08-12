---
Status: accepted
Date: 2026-08-12T01:39:15.679Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0364. Graphify owns surfaces and file scopes; a bounded oracle confirms cut edges inside Decompose

## Context

Supersedes the graphify-proposes/LSP-disposes recommendation the user pushed back on. Today the parallel-safety authority is the decomposer model's own self-declared dependsOn and fileScope: the unit table is built from them (mitosis.js:5469), isDispatchable gates on them (:2451-2458), and overlap is a pure string/glob prefix match (:52-67). The model proposing the partition is the only thing certifying it safe. Measured counter-evidence against graphify certifying alone: specs/2026-06-29-mitosis-design.md:60 records ~13% average false negatives and 25-32% on critical shared utilities at 0.9.1 - and shared utilities ARE the boundary symbols a decomposition cuts. A missed edge means two workers editing coupled code in parallel. The architecture already accepts no plan-time oracle is complete and backstops the residual at merge time in D6 (specs/2026-07-02-mitosis-cluster-tier-design.md:42).

## Options

- Graphify alone determines parallelizability, replacing the self-declared fields outright
- Keep the decomposer's self-declared dependsOn and fileScope as the authority
- Graphify owns surfaces, clusters and file scopes; a bounded oracle confirms only the cut edges before the seal

## Outcome

Graphify replaces the model's self-declaration for surfaces, clusters and file scopes - the whole speedup, and the closure of the self-declared-safety hole. The cut-edge set alone gets one bounded confirmation, and it runs INSIDE Decompose before the partition seals, so it hardens the producing phase rather than letting a consuming phase re-derive: the user's own governing principle applied literally. Clustering must be projected to FILE granularity before sealing, because leases are path prefix matches and a community-based partition is not automatically a partition of files - measured, 90 of 1,042 communities span multiple files and 68 of 967 files span multiple communities, and the straddling files are the large connected ones a run targets. The confirmation pass records, per run, how many edges it found that graphify did not; that count is the only recall instrument that measures 0.9.5 on this repo rather than 0.9.1 on TypeScript.
