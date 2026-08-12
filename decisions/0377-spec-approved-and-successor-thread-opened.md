---
Status: accepted
Date: 2026-08-12T07:37:50.695Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0377. The OS-process SPEC is approved by the user, and implementation moves to a successor thread

## Context

The user approved the SPEC at .claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md (branch docs/mitosis-os-process-spec, 894837f) and directed that the successor thread be opened. Approval satisfies the user-approval component of c3. Two things remain unsatisfied and had to be placed somewhere: the SPEC's own admission requirement that every path:line be re-verified before implementation, and the render-verification of the architecture artifact under c5.

## Options

- Run the citation re-verification pass now, close c1, c3 and c5, and open the successor only once the parent is terminal. Cleanest lifecycle, but blocks the user's explicit instruction to open the successor now.
- Open the successor and treat the admission pass as parent work that must land before the successor starts. Correct ownership, but a cross-thread dependency that no gate enforces.
- Open the successor with the admission gate as its own first completion criterion, so the successor structurally cannot be called done without it, whichever session actually runs it.
- Open the successor and drop the admission pass, relying on the SPEC text alone to compel it.

## Outcome

Opened the successor with the admission gate as its first completion criterion. The pass is a precondition of implementation, so the strongest place for it is a criterion on the thread that does the implementing - it is then unskippable by construction rather than by a reader remembering a sentence in section 0.2. Running it once satisfies the parent's c1 and c3 as well. The parent stays paused rather than done: its c1, c3 and c5 are still unchecked, and the Definition-of-Done gate refuses a close on an unchecked criterion. Dropping the pass was rejected outright - the SPEC names it a hard admission requirement, and line numbers are pointers that drift.
