---
Status: accepted
Date: 2026-08-16T20:58:30.354Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0479. Always reproduce a bug before diagnosing it, and test the fix for cause rather than effect

## Context

User ruling. When addressing a bug or broken functionality, agents must recreate the issue on the real surface first: send the actual request to a failing API, drive a real browser for a failing UI. Only then identify the cause, not the effect. The user's worked example is the infinite reviewer loop, where the loop is the effect and a retry cap guards the effect without addressing the cause. The user frames this as a verification and trust problem: given a task, ambiguity and guess-work must be eliminated before a fix is designed, or a targeted fix breaks other things.

The load-bearing argument found while designing this: a receipt proves a test passes, but it does NOT prove the test would ever have caught the bug. Without a reproduction, a green receipt is unfalsifiable. The reproduction is what makes the receipt mean something.

Two defects surfaced from this. Gate G0 required reproducing a symptom and was assigned wholly to delivery-lead, which has no shell and could never have cleared it. Gate G7 verified dependents only after the fix existed, so the blast radius arrived too late to inform the design.

A user clarification constrained the database case absolutely: no agent ever reaches a real production database holding real data.

## Options

- Leave reproduction as prose inside gate G0 and rely on agents to do it
- Make reproduction a named mechanism with a tool grant per surface, an owner, and a place in the bug sequence
- Add a reproduction checklist to the rules files

## Outcome

Reproduction becomes Mechanism 2 in report section 05, ahead of the Receipt, and gets its own bug-path sequence diagram at 6c. It has THREE modes: agent-run (the agent drives the surface); agent-authored and human-run (the agent writes an executable artifact, the human runs it and pastes back the result - a first-class reproduction with a handoff, not a fallback, and the only permitted path to live database data alongside a local disposable container or local copy); and cannot-reproduce, which routes to the honesty ladder so the fix stays speculative and is never quietly promoted to fixed.

Cause-versus-effect gets two mechanical signatures instead of an exhortation. The impossibility test: what is now impossible that was possible before? A cause fix names something; an effect guard says nothing, it just happens less. The guessed-constant smell: a new threshold, retry cap or timeout whose number cannot be derived from the system is an effect guard. Signature two is proven by this report's own round-1 maxTurns proposal, where the giveaway was that the numbers were guesses.

G0 is split by owner: investigator reproduces, delivery-lead pins the acceptance ceiling. G7 gains a pre-fix half owned by investigator, which returns the blast radius with its diagnosis. The roster table gains a Reach column so a gate can never again name an action an agent has no tool to perform; investigator receives browser automation via the mcpServers frontmatter field.

Rejected: leaving it as prose, because rules-file prose measured zero compliance across 15,573 runs and an instruction nothing can check is the failure this rebuild exists to remove.
