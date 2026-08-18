---
Status: accepted
Date: 2026-08-18T00:44:17.856Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0547. Waves 4 and 5 are blocked on a missing generator substrate, shipped as its own unit first

## Context

A readiness audit run before fanning out waves 4 to 7 found that U1.3 shipped only half the machinery those waves assume. Three things do not exist. There is no per-agent spec store anywhere - the only spec object in the repository is a test fixture explicitly marked not a roster member, and composeAgentBody has no production caller at all. There is no driver that writes an agent markdown file from a spec; both compose and drift-check are pure functions. The drift check cannot run against the real roster: checkBodyDrift requires a specs array, and without one every agent file is flagged orphan and the result is false by construction. Separately, of the six shared fragments decision 0481 requires, zero exist as dedicated fragments; FRAGMENTS holds three keys and two of the required rules survive only as single bullets embedded in unrelated fragments. Also found: dispatchable-agent-schema-capable only checks agents that appear as engine string literals, five today, so U4.1's acceptance clause that its four new agents pass that gate is vacuous - they pass by not being checked.

## Options

- Dispatch waves 4 and 5 as specified and let each unit invent the spec store and driver it needs
- Insert one substrate unit ahead of wave 4 that ships the spec-store convention, the driver and the 0481 fragments
- Fold the substrate into U4.1 so the first unit to need it also builds it
- Reopen U1.3 against its original criteria to finish what it left

## Outcome

One substrate unit ships ahead of wave 4 on branch feat/agent-generator-substrate. Letting each unit invent its own was rejected as the specific collision the audit exists to prevent: four units would independently invent the same spec store, and whichever landed first would set the convention for the rest by accident rather than by contract. Folding it into U4.1 was rejected because it makes the mechanism land in the same diff as its first use, which SPEC section 4 forbids by name after three unfalsifiable checks on this thread. Reopening U1.3 was rejected under acceptance-as-a-ceiling - U1.3 met its declared criterion honestly and this sits above it. The spec store convention is PINNED as one file per agent under agent-specs, never a shared array, precisely so waves 4 and 5 can author in parallel without a common file; enumeration is a directory scan because a hardcoded name list is a pinned allowlist. The substrate ships zero real agent specs. Of the 0481 fragments, answer-format and honesty-ladder are determinable and ship; the Work Order and Receipt contract text is not in any reachable artifact and is to be reported capability-blocked rather than invented. U4.1's vacuous schema-gate clause is recorded here and filed, not folded in.
