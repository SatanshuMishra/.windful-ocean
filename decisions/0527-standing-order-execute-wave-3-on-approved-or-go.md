---
Status: accepted
Date: 2026-08-17T16:22:08.920Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0527. Standing order: a bare Approved or Go in a fresh session executes wave 3 by fan-out dispatch, no further confirmation

## Context

The user stopped work after wave 2 merged and moved wave 3 and beyond to a fresh session, to avoid a context compaction mid-flight. They asked that their operating instructions be recorded EXACTLY so that a single word in the next session executes them without re-negotiation. This record is that authorisation. A fresh session reading it should treat Approved, Go, or any equivalent affirmative as the complete go-ahead and begin dispatching immediately.

## Options

- Re-ask the user for scope, model tiering and autonomy at the start of the next session, spending a round-trip re-establishing what was already settled.
- Record the instructions verbatim as a standing order, so a single affirmative word resumes execution exactly as authorised.

## Outcome

On Approved or Go, execute the following VERBATIM standing order, which is the user's own wording and is not to be reinterpreted: "Next steps approved. Orchestrate via this MAIN thread. Dispatch dedicated subagents to ship ALL remaining MSPs to complete phases 0 - 3. Dispatch OPUS agents for thinking, planning, etc. complex tasks. Dispatch Sonnet agents for non-ambiguous, non-thinking, specific tasks. Sonnet MUST never be used for planning, thinking, etc. Dispatched OPUS agents MAY dispatch Sonnet agents to perform specific tasks following them being fully planned and thought through. i.e., Use the Fan Out dispatching architecture. Work autonomously with minimal to no required interaction with me. You are APPROVED to perform all actions necessary to complete this task. Work FAST but ROBUSTLY. Think hard." A second standing instruction from the same user, equally binding: "For blocking MSPs (i.e., further work is blocked by a MSP needing to be shipped), use Stacked PRs to keep working." OPERATIONAL CONTEXT the order does not carry, because it changed after the order was given: phases 0, 1 and 2 are ALREADY MERGED and verified by ancestry, so ALL REMAINING MSPS means wave 3 only - U3.1 (pull request 192, already open and base-current), then U3.2, U3.3 and U3.4 stacked per decision 0521. Build against decision 0524 for the observer record contract; never re-derive it, and never search the Claude Code binary to re-confirm it. Give capability_blocked its own event type before U3.4 cuts over, or that unit destroys decision 0493's work. Waves 4 to 7 are the "and beyond" and remain gated on the mitosis engine, which needs a ruling on the SPEC's own contradiction between section 5a and the section 6 table. Merging is denied to the session at two layers and stays the user's action.
