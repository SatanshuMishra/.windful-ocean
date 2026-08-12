---
Status: accepted
Date: 2026-08-12T01:39:06.612Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0363. The graph slice is computed from graph.json and supplied to the decomposer as input

## Context

0360 requires graphify structurally in Decompose with per-cluster subgraphs passed forward as JSON. The capability audit shows the CLI cannot carry that: query, path, explain and affected have NO json or format flag; the only --json in the tool is on diagnose multigraph; every query returns human prose; and no subgraph, slice, neighbourhood or ego-graph command exists at any verb. Separately, a required OUTPUT field cannot enforce a tool - the engine already has a shape check at mitosis.js:4949-4955 requiring dependentCount and edgeReasons that is satisfied by an EMPTY discoveredEdges.json. An LLM asked to return a subgraph can fabricate one, and schema checks shape, never provenance.

## Options

- Add a required provenance-tagged subgraph field to DECOMPOSE_SCHEMA and refuse on absent or empty
- Keep shelling to the graphify CLI from the decomposer prompt and parse its prose output
- Compute the slice deterministically from graph.json and supply it to the decomposer as input

## Outcome

The engine obtains the slice and hands it down. A deterministic function over graphify-out/graph.json takes a file set and returns the induced nodes, the induced links, and the boundary set (links with exactly one endpoint inside) which IS the cut-edge set - no model involvement, no prose parsing, no source reading. The decomposer receives that slice as INPUT, so it cannot run without it and cannot fabricate it; its output echoes which node ids it assigned to which cluster and the engine checks that echo by set membership against the slice it supplied, refusing on any id it did not issue. The sandbox cannot shell out, so a narrow courier agent runs the jq-class extraction and returns it under schema - the already-shipped pattern at mitosis.js:4517-4539 and :5173-5257, extended rather than invented. The same slice is then passed to each cluster's planner and implementer, which is what stops a fresh subagent repeating the work.
