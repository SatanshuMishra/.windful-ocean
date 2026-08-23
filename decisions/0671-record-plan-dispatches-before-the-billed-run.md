---
Status: accepted
Date: 2026-08-23T02:57:56.573Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0671. The recorder is fixed to see the planning phase before M8 spends money

## Context

M1 shipped dispatch recording, but the recording wrapper is installed only inside runUnit and the kind tracker can emit only review, security, diagnose, implement and redispatch. Planning runs in an earlier phase whose ports carry no recorder. Measured across every dispatches.jsonl on this machine: 9 implement, 6 review, 3 diagnose, and zero plan, plan-review or replan, including on a scenario that drove four plan-review dispatches. M8's acceptance asks for at least one recorded cassette per dispatch kind the run exercised, and M8 is the only unit permitted to spend money.

## Options

- Fix the recorder first: wire recordDispatch into the planning phase with a test, as its own pull request, then run M8 once and harvest a complete set
- Run M8 now and file plan-family blindness as a new item, harvesting only the five recordable kinds, treating acceptance strictly as a ceiling
- Fix the recorder and defer the billed run to a later session

## Outcome

Fix the recorder first. The plan and plan-review family is exactly where the always-succeeding stub diverged from real model behaviour, so a harvest that omits it leaves the central defect unmeasured. The one authorized billed run is spent either way; spending it half-blind wastes it and a re-run costs money again. Consequence: the billed run is gated on a human merge of the recorder pull request and a fast-forward of the primary checkout, so M8 cannot close in the session that opened it.
