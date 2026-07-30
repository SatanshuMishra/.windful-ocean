---
Status: accepted
Date: 2026-07-30T19:57:38.289Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0134. Halt the implementer-review fix rounds; plan both tracks up front against one shared invariant set before any further code

## Context

Five fix rounds ran this session across two tracks, and every one introduced a defect on a path its own finding list did not name.

Track A, plugin hooks. Round 1 introduced a new false clean of exactly the class it was written to kill: a managed-dir identity test based on a content SUBSTRING, run against the already-stored value and used to OVERWRITE config, so a user gate merely mentioning the config key was reclassified and silently dropped. Round 2 fixed that in the destructive tier but left the SAME probe gating capture on first install, and added two new silent-gate-death paths: reference-transaction (a gating hook per githooks(5)) was silenced by a noise-reduction change, and multiplicity counted across all config scopes so healthy configs were declared corrupt and destroyed. Round 3 deleted the content probe outright and was the first clean round - notably the implementer found its own remaining false positive before any reviewer.

Track B, sandbox harness. Round 1 shadowed value globals with throwing proxies, so `x === undefined` silently returned false against an engine that uses the undefined identifier 63 times in control flow - a false-EVERYTHING and a fidelity regression versus the harness it replaced. Round 2 redesigned to prune the vm realm, fixing that completely, but createContext({}) left a host-realm backing object so nine bare identifiers bridged to the host and defeated every denial without throwing - while the test suite asserted the one closed route and none of the nine open ones.

The common cause is not competence and not the review bar; both reviews were excellent and every finding was reproduced. It is that each round was SCOPED TO A FINDING LIST. An implementer given N findings fixes N findings, and the N+1th path is invisible because no artifact states what the system must be true of as a whole. Fixing the named thing kept moving the failure instead of removing it.

The user force-stopped implementation on this basis and directed a dedicated Fable planning agent, in a fresh session, to understand both tracks and plan a solution that does not regress either.

One clarification the record supports: the two tracks are in DIFFERENT repositories and do not interact at runtime. The regression is intra-track, between successive fixes, not cross-track. A plan must therefore hold a per-track invariant set, plus the shared method that both tracks kept violating.

Trajectory was improving when stopped - Track A round 3 self-caught, Track B round 2 produced an honest four-mutation kill that correctly explained why its split was necessary. The method works; per-round scoping is what failed.

## Options

- Continue the implementer-review cycle round by round - rejected by the user after five rounds, on the evidence that each round moves the failure rather than removing it
- Revert both branches and restart - rejected implicitly: both branches carry real, reproduced, tested progress (Track A 692/692 with the content probe deleted; Track B 1690/1690 with the value-global corruption structurally impossible), and the review record is the most valuable artifact produced
- Land the remaining one-line fixes (DONT_CONTEXTIFY on Track B, round-3 review on Track A) and stop - rejected: this is exactly the per-round scoping that produced five consecutive escapes
- Halt implementation, dispatch a dedicated Fable planning agent in a FRESH session to derive the full invariant set for both tracks and a plan whose every step is checked against ALL invariants, not just the finding it addresses

## Outcome

Implementation is HALTED on both tracks. No further code, no PR, no additional fix round until a plan exists.

Next session opens by dispatching a dedicated FABLE subagent to understand both tracks end to end and fully plan the solution such that completing either does not regress the other. The plan must state, per track, the invariants the system must satisfy - not a finding list - and must check every proposed step against the whole invariant set. The five escapes of this session are the test data: a plan that does not explain why each of them would have been caught is not finished.

Nothing is reverted. Both branches stay pushed and in sync (Track A fix/hooks-prior-path-self-heal at 5bc19a4, 692/692; Track B feat/workflow-sandbox-harness at e40a292, 1690/1690). The accumulated review findings - every one reproduced with concrete inputs and observed output - are the primary input to the planner and must not be re-derived from scratch.

Known-open and already-diagnosed, to be folded into the plan rather than fixed ad hoc: Track A needs its round-3 review, which never ran. Track B needs createContext(vm.constants.DONT_CONTEXTIFY) (reviewer-verified one-liner), the nine missing bare-identifier probe rows, and two inert constants that survive being emptied.
