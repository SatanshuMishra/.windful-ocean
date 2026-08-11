---
Status: accepted
Date: 2026-08-11T23:53:49.239Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0356. The SPEC claims a gated dispatch guarantee and names the residual, never tool absence

## Context

0326 settled that zero variance means instructions are binding, enforced the way pull-requests.md enforces pr-create. 0352 then made the main thread the orchestrator, and a main thread cannot have Agent and Bash denied by bare name - they are how it works at all. The temptation is to claim structural impossibility anyway.

## Options

- Claim the gated guarantee and state the residual plainly - chosen
- Claim structural impossibility via tool absence
- Leave the guarantee unstated in the SPEC

## Outcome

The SPEC claims only the weaker, true guarantee, in these words: every dispatch path other than the mitosis verb is denied at the PreToolUse gate and in permissions.deny, origin-agnostic so it needs no per-tool maintenance. It is a GATE, not tool absence, and the SPEC says so rather than implying more. RESEARCH-enforcement-surface.md in the 2026-08-10 handoff artifacts is the input for the deny surface; it exists, was never consumed, and is read before any new enforcement research is commissioned.
