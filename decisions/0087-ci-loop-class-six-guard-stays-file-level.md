---
Status: accepted
Date: 2026-07-28T20:01:01.439Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0087. Confirm the class-6 assertion guard at file granularity rather than 0067's line granularity

## Context

Spec §13 open ask (c), gating M8. §4 escalation class 6 parks any candidate fix whose diff touches a file containing a failing assertion. Decision 0067 had formulated this at line granularity. A line-level guard needs a per-framework log parser and must survive post-fix line drift; the file-level rule needs neither. Context from §4's research: green CI is a weak oracle and is precisely the signal an auto-fixer optimizes against, so the loop is deliberately biased toward escalation.

## Options

- Confirm file-level, accepting over-escalation as the safe direction
- Hold to 0067's line-level formulation and build the per-framework parser
- Make granularity configurable per project

## Outcome

Confirmed at file level. It is a strict superset of the line-level rule and therefore a deliberate strengthening, never a weakening; it removes a per-framework parser and the line-drift problem. Its cost is over-escalating the case where the test itself is wrong - which is exactly the case that should reach a human. The failing test file is already reported by the ship stage. Taken on the user's 2026-07-28 instruction to proceed as recommended. This deviates from 0067 in the stricter direction only; 0067 is not superseded, its assertion-line class is implemented more conservatively than specified.
