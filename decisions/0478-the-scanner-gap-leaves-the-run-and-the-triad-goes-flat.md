---
Status: accepted
Date: 2026-08-16T20:00:59.375Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0478. The secret-scanner gap is fixed as ordinary work, and the measurement run becomes a flat independent triad

## Context

Sourcing units for the measurement run surfaced a live security gap rather than mere fodder. .claude/hooks/secret-scanner.sh is a blocking PreToolUse hook whose openai_key pattern is sk- followed by 32 or more alphanumerics, so the hyphens in a real Anthropic key of the sk-ant-api03 form mean the pattern never matches and the key is written through unblocked. The child's own one-command repro was re-run under the narrow exception for a finding that changes the plan, and the hook returned exit 0 where it must return 2. The gap sits in a defensive control in a repository whose entire subject is Anthropic tooling, and the hook carries no test coverage at all. That candidate was also one half of the only genuine dependency edge the survey found, a fix paired with the test suite that asserts it, so removing it from the run removes the edge: once the fix lands the paired assertion is green on arrival and the ordering is no longer exercised. The remaining candidates are mutually independent, covering the lint-on-edit bail-out branches, the semgrep canonicalize script, and two impeccable skill helpers.

## Options

- Run the security fix as one of the three measured units, keeping the dependency edge intact
- Hold the run until a replacement dependency edge is found among the remaining candidates
- Fix the gap as ordinary work now and run a flat independent triad

## Outcome

The scanner gap is fixed immediately as ordinary work on its own branch off main, with a test suite the hook has never had and a clean-input case proving it does not block indiscriminately, and it is not part of the measurement run. A security fix must not ride on an experimental run that may retry, park, or be discarded, and entangling the two would make the fix's fate depend on the experiment's. The measurement run becomes a flat triad of three mutually independent units, so this run measures dispatch volume without exercising scheduler ordering, and that limitation is recorded here rather than discovered when the figure is read. Holding the run for a replacement edge was rejected because no natural edge exists among the survivors and a manufactured one would make the measurement describe the rigging. Ordering behavior under a real dependency remains unmeasured and is a later experiment.
