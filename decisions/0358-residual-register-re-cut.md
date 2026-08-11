---
Status: accepted
Date: 2026-08-11T23:54:05.869Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0358. SPEC B's residual register is re-cut: only the quality-blindness residual stays open

## Context

SPEC B section 8 carries six residuals shown open. On review three are not questions at all - the SPEC already answers them in its own prose and then files the answer as an unknown, which inflates the open-question count and hides the one residual that genuinely has no answer.

## Options

- Re-cut so only genuine unknowns stay open - chosen
- Carry all six into the rewrite as open residuals
- Delete the register and rely on the acceptance criteria

## Outcome

Three residuals are promoted out of the register into STATED RULES: leave runUnit whole if byte identity cannot hold across a split; report the CI budget and the token budget as two numbers, never one; treat the plain --base convention as correct until gh-stack leaves preview, which is a review trigger and not a task. One becomes an ACCEPTANCE CRITERION: a baseline is at least three runs at pinned repository state reporting variance, never a single run presented as a measurement. One stays genuinely OPEN and gets new work: the instrument counts tokens and cannot see whether a fused Decompose cuts worse, so every Part II hypothesis must pair its token metric with a fixed quality assertion or a token win with a quality regression is unfalsifiable. The rejected reviewLoop diff cache stays recorded as closed so it is not rediscovered as an opportunity.
