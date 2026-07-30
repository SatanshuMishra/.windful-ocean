---
Status: accepted
Date: 2026-07-30T06:11:48.886Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0120. LSP probe is GREEN: call hierarchy drives from a CLI verb, but only with a seeded project, and the unseeded failure mode is a silently partial answer

## Context

0116 kept task edges LSP-grounded, rejected fileScope-only overlap, and left one thing open with its falsifier attached per 0112 rule 3: whether native LSP call hierarchy can be driven from a CLI verb at all, or must remain one scoped model dispatch. That probe was to run BEFORE the spec was written, with the 0103-to-0107 sequence as the standing case study for skipping it. User directed on 2026-07-30 to proceed with the recommended robust plus simple option. Probe executed this session against this repo, which has NO tsconfig and NO jsconfig - the hard case. Target: deriveEdges at .claude/lib/superpowers-parallel/derive-edges.mjs:44, which has one same-file caller and two cross-file callers in tests. Server: typescript-language-server at /opt/homebrew/bin/typescript-language-server, spawned over stdio JSON-RPC from a plain Node script, no harness tools involved.

## Options

- fileScope-overlap-only edges, already rejected by 0116
- Deterministic verb driving LSP, seeded by the transitive importer closure of the fileScope union
- Keep one scoped model dispatch for edge derivation
- Whole-repo didOpen seeding

## Outcome

GREEN, MEASURED. A CLI verb CAN drive LSP call hierarchy: initialize reported callHierarchyProvider true, prepareCallHierarchy resolved the symbol, and callHierarchy/incomingCalls returned real callers in 2.7s to 4.1s wall clock. So 0116's amendment stands and edge derivation becomes a deterministic verb, NOT a third model exploration and NOT a scoped model dispatch. THE FINDING THAT MATTERS IS THE FAILURE MODE, and it is worse than an error: with only the target file opened, the query returned ONE caller - the same-file one - and ZERO of the two real cross-file callers, with NO error and NO empty result. A naive verb would have reported a plausible non-empty answer that silently misses exactly the cross-file call dependency 0116 rejected fileScope-only for missing, and two dependent tasks would have been scheduled as parallel-safe. Cause: with no tsconfig, tsserver builds a per-file INFERRED project. Seeding the same query by also opening the two candidate files returned all three callers, 2 cross-file, 15 call ranges in one. Stage 1 versus stage 2 on the identical symbol and server IS the failability proof required by 0117, produced by measurement today rather than assumed. BINDING DESIGN RULES. (1) SEED SET is the fileScope union PLUS the TRANSITIVE importer closure of that union, walked to fixpoint by deterministic grep - one hop is insufficient because a barrel re-export hides the real caller two hops out. Whole-repo seeding is REJECTED: 1531 candidate JS files and 24 MB in this repo alone. (2) The verb DECLARES its seed set in its output; an answer means edges are complete WITHIN the declared seed and never that no other caller exists - the 0117 declared-coverage model applied to the dependency oracle. (3) A closure exceeding its declared cap HALTS FAIL-CLOSED naming the cap; it never answers partially. (4) The verb ships a CANARY RECEIPT: a fixture with a known cross-file call edge, asserting the seeded query finds it AND the unseeed query misses it, so the seeding regression cannot land silently. Cost note: seconds per query against tens of KB of prompt plus a model round-trip for the dispatch it replaces.
