---
Status: accepted
Date: 2026-08-06T02:12:37.131Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0256. Keep G4's verb denylist; do not invert it to a reader allowlist

## Context

After c3 made the harness fail-closed, the natural next move looked like inverting G4 too: allowlist known readers and escalate everything else touching a guardrail path to ask. That is fail-closed by construction, and section 5 already rules out enumerating write verbs, since cp, tee, perl -pi, install, patch, ed and git checkout are an open-ended set. The problem is frequency. The guardrail path list contains .claude/hooks/, so the gate's OWN test files match it, and every node --test .claude/hooks/tests/ run would prompt - many times per session during this very rebuild. That is the prompt-fatigue frequency effect the plan's research says destroys a gate's value, and it would land hardest on the people maintaining the gate.

## Options

- Invert to a reader allowlist: no-opinion only for recognized readers, ask on everything else mentioning a guardrail path
- Keep the verb denylist, close the named gaps, and rely on chflags uchg at c7 to close the open-ended write-verb surface at the OS level
- Hybrid: invert, but carve out an exemption for the gate's own test paths

## Outcome

Keep the verb denylist. The two halves of G4 are paired for exactly this reason: chflags uchg is what actually closes open-ended write verbs, at the OS level, and it collapses the problem into one closed enumerable surface, chflags nouchg. The verb list is defense-in-depth underneath that, not the primary control, so its incompleteness is tolerable by design. c4 builds the nouchg gate and closes the three named gaps (git checkout, perl -pi, cp into bare .claude/); c7 applies the flags. The hybrid was rejected because an exemption carved for the maintainer's own convenience is the seam an injected agent aims at.
