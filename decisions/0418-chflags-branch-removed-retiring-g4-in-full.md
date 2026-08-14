---
Status: accepted
Date: 2026-08-14T05:57:39.013Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0418. The chflags nouchg branch is removed, retiring G4 in full

## Context

0417 deleted the gate's guardrail-write verb set on instruction but kept the chflags nouchg branch, on scope discipline alone: the instruction named the write verbs and not the unlock. That left the gate escalating removal of an immutable flag from a guardrail file while allowing any command to overwrite or delete that same file outright. The asymmetry was recorded as a residual risk in the threat model at the time it was created, with a note that it should be removed or restored to coherence the next time the gate was touched. The owner then instructed its removal directly.

## Options

- Keep the branch on scope discipline and leave the incoherence recorded
- Remove the branch, retiring G4 in full
- Restore coherence by reinstating the write-verb control the instruction deleted

## Outcome

The branch is deleted and G4 now has no control at all: a guardrail file may be written, deleted, relocated, symlinked over, or unlocked without a prompt. This was the coherent choice rather than a widening, because escalating the unlock while allowing the overwrite guarded nothing and cost a prompt in an unattended run for no protective benefit. The guardpath matcher survives in the source only because G5 branch B still uses it to match an at-prefixed reference to a guardrail file in an exfiltration shape. G4's corpora were retained in the test suite as allow-expecting cases, so a silent reintroduction of either retired control fails the suite. Threat-model row 20 was rewritten from "the surviving branch is close to vacuous" to the standing consequence: an immutable flag set with chflags uchg is no longer a speed bump against the agent that set it, and if immutable flags are ever load-bearing again, the control that reintroduces them must cover the write verbs in the same change. Supersedes the corresponding clause of 0417.
