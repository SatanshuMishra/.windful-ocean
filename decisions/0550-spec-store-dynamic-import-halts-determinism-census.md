---
Status: accepted
Date: 2026-08-18T01:23:00.311Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0550. The spec store's dynamic import halts the determinism census; register a declared exception

## Context

Classifying agent-specs as scanned engine source took the substrate branch from 18 failures to 2, and phase-parity and dispatchable-agent-schema-capable now pass. The determinism verb still halts at exit 42, and the reason is architectural rather than a slip: mitosis-gate reports that agent-spec-store.mjs line 57 carries an import() that does not take a string literal, so the census cannot tell which module it loads and refuses to guess. The two conflicting requirements are both deliberate. The store MUST load spec modules discovered by a directory scan, because a hardcoded name list is a pinned allowlist and was rejected as an automatic failure when the substrate was specified. The determinism census MUST refuse a non-literal import, because that is exactly the closed-census discipline that makes it trustworthy. Neither side is wrong and neither can simply yield. Measured on the substrate branch at f813cdb5, which already carries a merge of main and therefore the retirement-census verb, confirmed at exit 41 with 19 sites.

## Options

- Register agent-spec-store.mjs as a declared determinism exception with a written reason
- Exclude agent-specs from the census after all, reversing the scanned-source ruling
- Restructure the loader to avoid dynamic import by reading and parsing spec files instead of importing them
- Hardcode the spec module list so every import takes a string literal

## Outcome

Recommended resolution, carrying direct precedent from this same thread rather than invention: register agent-spec-store.mjs as a DECLARED exception in the determinism census with a written reason, exactly as U3.3 did when its DuckDB runner tripped the deny-by-default spawn census over .claude/lib. A declared, reasoned exception preserves the census as a closed classification that halts on the unclassifiable, whereas widening the rule would blunt it for every future case. Excluding agent-specs was rejected because it recreates the blind spot inside the generation mechanism that the scanned-source ruling exists to close - a spec containing Date.now would make its generated body differ on every run. Restructuring the loader to parse rather than import was rejected because it would stop specs being real modules and forfeit validateAgentSpec. Hardcoding the module list was rejected as the pinned allowlist the substrate was specified to avoid. NOT YET APPLIED: the substrate agent was still working when this session wound down and has not reported, so it may have reached its own resolution. The fresh session reads the branch and that agent's result BEFORE acting, and treats this as a recommendation with its reasoning, never as work already done.
