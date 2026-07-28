---
Status: accepted
Date: 2026-07-28T06:45:13.934Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0067. Adopt the bounded fileScope-confined CI fix loop plus the assertion-line escalation class

## Context

Target capability (ii) is driving a shipped MSP's red CI back to green automatically. Research established that NO surveyed production system fix-forwards a published branch autonomously: the universal patterns are rerun-once for flakes (Azure DevOps, Google), quarantine plus owner ticket (Meta PFS), revert-first (Chromium sheriffs), and eject-to-author with zero retries (GitHub merge queue, bors-ng, Mergify). Repairnator produced 4-5 human-accepted patches across ~30,000 failing builds; the overfitting literature (Smith et al., FSE 2015) shows patches that satisfy a failing test routinely break unasserted behavior, making green CI a WEAK ORACLE - precisely the signal an auto-fixer optimizes against. Meta built a full repair system (SapFix) and still hard-gated it on human review. The design agent nonetheless proposed a 3-attempt, append-only, fileScope-confined loop built on the existing remediation supervisor (mitosis.js:3284-3324) with distinct-failure-fingerprint enforcement via the existing triedSet, and its own pre-mortem predicted the exact failure the research documents - naming the guard it had not shipped.

## Options

- Design's 3-attempt loop as proposed
- Design's loop plus a fourth escalation class: escalate any fix whose diff touches the lines the failing test asserts on
- Industry envelope only: rerun once for flakes, revert as a new commit, escalate everything else - zero autonomous fix-forward

## Outcome

USER RULING: the design's loop PLUS the missing escalation class. Binding parameters for the spec: append-only on published heads (plain fast-forward push and forward merge of origin/base; never rebase a published ref, never force-push); hard bound of 3 attempts per PR, each requiring a NEW failure fingerprint so identical-failure loops are structurally impossible; fingerprints durable in the park note so relaunch does NOT reset the count (without this the event-watch relaunch and the fix loop compose into the unbounded loop the SIMPLE+ROBUST constraint forbids); one no-code-change CI rerun permitted per PR as a flake probe, counting as an attempt. Escalate immediately and unconditionally: implicated paths outside the MSP's declared fileScope; CI infrastructure failures; receipts/D6 enforcer configuration; security-classed checks; merge conflicts touching foreign scope; AND the newly added fourth class - any candidate fix whose diff touches the lines the failing test asserts on, which is the weak-oracle hole the research identifies and the design's own pre-mortem predicted. On exhaustion, park with kind ci-red-exhausted, PR stays open with red CI visible; the agent never asserts green anywhere, CI remains the sole green authority, consistent with the ratified PR honesty rule.
