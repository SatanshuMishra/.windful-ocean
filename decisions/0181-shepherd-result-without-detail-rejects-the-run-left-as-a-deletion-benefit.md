---
Status: accepted
Date: 2026-08-01T05:40:01.812Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0181. A shepherd result without a detail string rejects the whole run; left unfixed as an M3 deletion benefit

## Context

Building A3's failure fixtures surfaced a real production defect, measured in both directions rather than reasoned about. A shepherd agent returning {opened: false} with NO detail field does not park the unit - it rejects the entire run with TypeError: Cannot read properties of undefined (reading 'replace'), because clean(v) at mitosis.js:34 is JSON.stringify(v).replace(...) and JSON.stringify(undefined) returns undefined. Hit at mitosis.js:3428 via clean(opened && opened.detail). The identical hazard sits at :3389 for a restack returning {ready: false}. With an explicit detail string, both park correctly.

## Options

- Fix clean() or the two call sites now, in the A3 PR
- Fix it in a separate production PR before M3
- Leave it unfixed and record it as a benefit M3's deletion delivers
- Pin the crash itself in the characterization test

## Outcome

LEAVE UNFIXED, recorded as a deletion benefit. The defect lives entirely on the path M3 deletes, so fixing it is work that M3 throws away, and A3 is a test-only MSP whose whole value is that it touches no production code (mitosis.js is byte-identical at 113d093a on both sides of PR #29). The crash is NOT pinned as behaviour either: pinning it would document a bug as a contract. Instead every A3 failure fixture supplies an explicit detail string, and the hazard is recorded here. Two consequences to carry: if M3 slips or the path survives in any form, this becomes a real fix candidate rather than a note; and any future test author writing a shepherd-failure fixture must supply detail or the run rejects with a TypeError that looks nothing like the behaviour under test. Method note: the harness agent claimed detail-less {opened:false} produced a parked entry and overallStatus blocked. It does not. The design agent measured both directions before believing either - the third consecutive time this session's lineage that a confident agent claim inverted on execution (after 0159 and 0163).
