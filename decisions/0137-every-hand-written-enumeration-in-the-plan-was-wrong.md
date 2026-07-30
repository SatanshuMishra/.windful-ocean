---
Status: accepted
Date: 2026-07-30T23:48:46.068Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0137. Every hand-written enumeration in the plan was wrong; only closed censuses found it

## Context

0134 halted the fix rounds on the finding that an implementer given N findings fixes exactly N and the N+1th path stays invisible. The two-track plan's remedy was closed censuses. This session executed three of them against real code and can now report whether the remedy works, and whether the plan's own numbers survived contact.

## Options

- Trust the plan's enumerated lists and assert against them directly
- Derive every universe mechanically at runtime and treat the plan's lists as unverified hints
- Sample the enumerated lists and spot-check a few members

## Outcome

The remedy works and the plan's numbers did not survive. Two enumeration failures, both found by the census and not by any list. HOST ROUTES: the plan enumerated nine bare identifiers bridging to the host realm; the closed census over the real host property set derived TWELVE, with __defineSetter__, __lookupGetter__ and __proto__ additional, and all three were confirmed by hand to return the real host cwd before the fix. REALM DENIALS: a DONT_CONTEXTIFY realm global carries 67 own names of which 47 require denial; the hand-written 9-entry ALWAYS_DENIED classified exactly THREE (console, eval, Function). The other 44 - Reflect, Proxy, WeakMap, Atomics, WebAssembly, every TypedArray, escape, parseInt and more - were being removed by an unnamed not-in-retained rule with no policy row at all. Three further plan corrections, now on the record because the plan is wrong as written: (a) it names ownKeys as the B2 fix site, but the ownKeys filter is LEGAL while the target is extensible - the trap that had to be added is preventExtensions, absent from the handler entirely, and Object.seal(Math) fails identically though the plan mentions only freeze; (b) "Math's eight non-writable constants" misses a ninth key, the non-writable Symbol(Symbol.toStringTag), which a string-only complement census would skip; (c) "one row per trap" is insufficient without a control realm, because Math(), new Math() and apply/construct on a non-callable throw ordinary language TypeErrors that must NOT be tagged - without differential classification against an unguarded realm the oracle demands tagging a plain "not a function", a false red that pushes toward weakening the guard. Standing rule going forward: derive every universe mechanically at runtime; treat any enumerated list in a plan, including this one, as an unverified hint that must be re-derived. Corollary observed twice: the ORACLE fails the same way as the code under test - the B1 probe first classified __proto__ as benign null-prototype and would have excused a real host bridge, and the B5 derivation harness injected its own collector variable into the derived identifier set. Audit the oracle with the same suspicion as the subject.
