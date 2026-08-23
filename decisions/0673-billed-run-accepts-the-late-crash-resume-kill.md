---
Status: accepted
Date: 2026-08-23T04:03:53.274Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0673. The M8 billed run proceeds without fixing the late crash-resume kill

## Context

The single lane's crash-resume kill always lands too late, and structurally so. With one unit the engine writes the built journal record and quiescent-exit one millisecond apart, while the harness polls for built at one hertz, so the poll can never observe built before the run has already gone quiescent. The kill therefore lands during Ship rather than mid-Execute. This destroyed the 2026-08-21 billed single-lane run: six of eleven declared criteria failed and zero pull requests opened after roughly six to eight dollars of live dispatch. The harness file has not been modified since, so the failure will recur unchanged. M8 is the only MSP permitted to spend money, so the run is effectively one shot.

## Options

- Accept the failure and harvest anyway. All eight dispatches of the 2026-08-21 run completed before the kill landed, so dispatches.jsonl is written intact and the cassette harvest is unaffected. The declared criteria that fail are the pull-request and crash-resume ones, none of which M8's acceptance criterion names.
- Fix the built-wait condition in the harness before spending, so the kill fires on built and not on quiescent-exit, or fires earlier. Costs nothing to write and would make the run additionally validate the crash-resume leg.
- Abandon the single lane and harvest from the full four-unit lane instead, where unit one's built record arrives long before quiescence so the race does not occur.

## Outcome

Accept the failure and harvest anyway. M8's acceptance criterion is cassettes per dispatch kind the run exercised, the sweep re-run against them, and any authored-versus-recorded outcome difference reported as a finding. Nothing in it requires the run to ship a pull request, and the harvest input is written before the kill. Under the acceptance-is-a-ceiling rule the built-wait defect sits above M8's ceiling and is filed as a new item rather than folded in, consistent with the frozen-SPEC decision and the no-further-discovery-rounds decision. The rejected fix is the more dangerous option despite being free: it would put an unproven harness edit into the single path that costs money, trading a quality risk for scope the SPEC forbids widening. The full lane is rejected because it changes what is being measured and costs several times more.
