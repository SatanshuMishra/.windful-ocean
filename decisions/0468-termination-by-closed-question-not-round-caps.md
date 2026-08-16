---
Status: accepted
Date: 2026-08-16T17:37:30.972Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0468. Terminate review loops by closing the reviewer's question, not by capping rounds or turns

## Context

Round 1 proposed bounding the implement-review-fix loop with a maximum of 2 fix rounds plus a per-agent maxTurns cap, with guessed values. The user rejected this: infinite looping is the EFFECT of a cause, and guarding an effect while hoping the cause disappears is not a design. The critique was correct - the guessed numbers were the tell. External work (LoopTrap, arXiv 2605.05846) locates the cause precisely: non-termination comes from ambiguous completion criteria, and the fix is an objective criterion the agent does not control.

## Options

- Bounded fix rounds plus a maxTurns cap - rejected by the user as guarding the effect
- Let the reviewer run until satisfied - rejected: this is exactly the ambiguous-completion-criterion failure mode, and satisfaction is a moving target the reviewer can extend indefinitely
- Give the reviewer a closed acceptance set and a per-criterion verdict - chosen
- Add a second reviewer to adjudicate - rejected: duplicated subjective review draws on the same weak instrument (LLM judges top out at AUROC 0.65) and adds an error source rather than confidence

## Outcome

The cause is that "is this good?" is an open question, so every round finds something - the question working as asked, not a malfunction. The reviewer therefore never receives an open question. It receives the closed acceptance set pinned in the Work Order before work started, and returns a verdict per named criterion. Each criterion's status moves one direction only: open -> met, or open -> not-met -> one fix attempt -> met | unverified-reasoned | speculative | reverted. All four terminal statuses are the receipts/gates@1.1 honesty ladder, already in force. The set is finite and fixed at dispatch, so every criterion reaches a terminal status and there is nothing left to rule on. Termination is a property of the state machine, not of a budget. A finding outside the acceptance set CANNOT mark the unit incomplete - it is filed as a new item, and that is the only thing available to the reviewer rather than a disposition it chooses. maxTurns is retained solely as a crash guard for a genuinely runaway agent, set generously or left unset, and is explicitly not the termination mechanism. Noted for the record: the answer was already in receipts.md, which pins acceptance as a ceiling and defines the ladder; round 1 reached for a counter instead of using the state machine already running.
