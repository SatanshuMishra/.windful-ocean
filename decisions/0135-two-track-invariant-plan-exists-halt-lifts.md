---
Status: accepted
Date: 2026-07-30T20:53:34.015Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0135. The two-track invariant plan exists and 0134's halt lifts; three review gaps were closed before any code

## Context

0134 halted implementation on both tracks until a plan existed that states per-track INVARIANTS rather than a finding list, checks every step against the whole set, and explains why each escape would have been caught. A dedicated Fable planning agent produced it read-only; it lives at docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md. It delivers A1-A6, B1-B6, method invariants M1-M6, and a six-row escape traceability matrix, each invariant carrying an oracle labelled CLOSED or OPEN plus a falsifier. The planner EXECUTED rather than argued the critical reproductions: E6 both directions (createContext({}) returned the real host cwd; DONT_CONTEXTIFY threw ReferenceError process is not defined), the untagged Object.freeze(Math) TypeError, the bogus Math.ceil over-denial, both inert constants, and the vacuous dead-export lint. One finding CONTRADICTS 0134: the tracks are independent as code (neither imports the other) but the continuity plugin manages .windful-ocean's core.hooksPath, so Track A is the pre-commit gate that runs Track B's tests - build-time coupling, not runtime. Orchestrator review then found three gaps: (1) A5's oracle was OPEN by enumeration against githooks(5), the exact shape that caused E3 and which M2 forbids; (2) M1 required an invariant-coverage table on every PR, unimplementable because pr-create owns the body with a closed flag set, 200-char values and denied post-creation edits; (3) the matrix was one of six proved by execution, the rest traced from historical source.

## Options

- Accept the plan as returned and dispatch Step A-1 and B-1 immediately
- Red-team the plan with an independent adversarial agent before any execution
- Narrow to Track B only and land the reproduced CRITICAL fastest
- Send the plan back to the same planner to close the three gaps, then execute

## Outcome

The user chose to close the three gaps first; the amendment ran and is applied. A5 is now a CLOSED census: the hook-name universe is machine-derived by parsing .SS headers from the installed githooks(5) (28 names, .TH stamp Git 2.55.0 verified equal to git --version), cross-validated against the binary via git hook run (a non-member exits 1, unknown hook event), with a total classification table whose keys must be set-equal to the derived universe so a future git's new hook HALTS instead of defaulting non-gating; cross-checked against the dispatcher's case arms (dispatcher:11-15) and CHAINABLE_HOOKS (18 of 28). M1 is re-carried as a committed invariant registry plus a per-PR coverage entry enforced by a CI census step in Track A's receipts.yml and Track B's test.yml (both verified to exist and trigger on pull_request); enforcement is CI plus the human merge gate, never the PR body. A GAP-3 sweep applied the same test to every remaining open oracle: A3, A4, B2 and B3 are CLOSED (report coverage derived from the exported outcome enums, since a new member falls to return null at session-start.mjs:43,47-48; a write-call-site static census, with prior-hooks-path.mjs:196,:244 unchecked today; the 13 Reflect-derived proxy traps, freeze having been the unenumerated operation; and the Reflect.ownKeys-minus-denied complement census asserting no TAGGED violation rather than no throw, because Math's eight non-writable constants throw legitimately). A2 stays OPEN deliberately and safely - writes are restricted to WRITABLE_SCOPE_FLAG local/worktree, so an unrecognized origin can never receive a destructive write. Two residuals added: M1 verdict truthfulness (CI proves the table is total, not that a not-threatened verdict is true) and A5 row content (omission closed, misclassification human-transcribed). 0134's halt is LIFTED by its own terms. NO CODE was written this session. Gap 3 is accepted as-is: Step A-1 is the executable proof and is a hard gate, not a formality - the matrix stands at one of six executed until it runs.
