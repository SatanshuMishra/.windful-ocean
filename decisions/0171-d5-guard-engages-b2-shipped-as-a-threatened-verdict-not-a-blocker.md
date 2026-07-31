---
Status: accepted
Date: 2026-07-31T22:47:05.919Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0171. The D5 guard engages sandbox invariant B2; it ships as a threatened verdict, not a second block

## Context

Authoring P2's coverage entry surfaced an angle none of 0165, 0166 or 0169 considered. 0169 accepted that D5's guard swallows the log sink's error, reasoned entirely as a totality-versus-error-reporting trade inside the fold. The authoring agent, reasoning from the sandbox track instead, observed that the same bare catch sits in workflow-body position: status-facts.mjs:26-31 with its twin at mitosis.js:561-566 wraps the sink call in `try { log(line) } catch {}`, so a SandboxViolationError raised inside the sink would be swallowed and that one denial would become unobservable. Registry B2 requires every denial to be observable as a tagged SandboxViolationError. The orchestrator verified the mechanism directly rather than taking it on report: git diff of ef92657 against its parent shows the bare `catch {}` verbatim. The finding is real, and it is the second time this session that an agent reasoning from a different lens found something the ruling lens missed.

## Options

- Block the P2 PR a second time and narrow the catch to re-throw a tagged SandboxViolationError
- Ship with B2 recorded as threatened and the mechanism stated in the entry, carrying the fix into the deferred second-channel follow-up
- Revert D5 and restore the untotal fold

## Outcome

SHIP with B2 threatened. A threatened verdict is the disclosure mechanism working, not a defect gate - it records that the change bears on the invariant, which this one does. Three reasons the block is wrong here. B2's own property is intact: the diff adds no sandbox mechanism and strips no tag; what it adds is a catch whose SCOPE could hide one, which is a reachability concern layered on 0169's accepted trade, not a new violation. Narrowing the catch to re-throw a tagged error is a new behavior change requiring knowledge of the tag surface, and 0142's corollary freezes a PR's scope at creation, so it cannot be appended later - it would mean blocking, re-reviewing and re-receipting a branch already fixed through five defects. And 0169 explicitly fenced this ground: surfacing a broken sink needs a SECOND reporting channel, which is the deferred follow-up, and anyone wanting it should treat it as that rather than re-litigate the guard. This record adds a requirement to that follow-up rather than opening a new one: the second-channel design must decide whether a tagged SandboxViolationError from the sink is re-thrown rather than merely reported, because a swallowed denial is a stronger failure than a swallowed log line. Method note, third instance this thread: the agent that found this was authoring documentation, not reviewing code - the lens found what the review lens did not.
