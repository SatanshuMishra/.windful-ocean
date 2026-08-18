---
Status: accepted
Date: 2026-08-18T21:26:57.510Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0593. Fold in text a change makes demonstrably false; file text merely suspected stale

## Context

Across this session the same question arose six times: a change makes some nearby text wrong, and the choice is to fix it inside the unit or file it as a new item. Acceptance is a ceiling, so folding everything in makes a unit unclosable; filing everything ships known falsehoods. The instances were an emitted population_note describing a deleted predicate, a skill procedure defining the retired rule, a refuted 52-of-55 measurement sitting six lines below a corrected definition, a suspected-stale agent_type figure, a stale decision citation naming 0580 where the shipped predicate is 0590, and a note asserting a one-way inference as certain when the sidecar read swallows failures.

## Options

- Fold in everything adjacent that looks wrong, treating the acceptance list as a floor
- File everything not literally named in the acceptance list, shipping text the change has already falsified
- Split on whether the change itself refutes the text or merely casts doubt on it

## Outcome

The test is whether THIS change refutes the text. Demonstrably false because of the work in hand - fold it in, because a change that leaves two live texts contradicting itself is not finished, and a corrected definition sitting above a refuted figure is worse than no correction at all, since the update lends the stale figure fresh authority. Merely suspected stale, with nothing in the run refuting it - file it, because folding in a suspicion rather than a refutation is how an acceptance list becomes a floor and the unit stops being able to close. One instance moved across the line and that is the test working rather than bending: the agent_type figure was filed as suspected, then deleted once the predicate change made its population undefined, so it was no longer stale but incoherent. Emitted output counts as text under this rule - a population_note is product, not a comment, and the no-comments rule does not reach it.
