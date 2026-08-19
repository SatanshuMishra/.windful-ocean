---
Status: accepted
Date: 2026-08-19T02:57:57.630Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0619. The test-suite cleanup is a follow-up criterion on this thread, sequenced strictly after mitosis runs

## Context

The measurement recorded at 0616 found the suite is not oversized but is partly blind: change-detector tests asserting source text, roughly 1,900 lines of fixture scaffolding filed as source, and several large test files whose subject is coupling and transcription rather than behaviour. Cutting into that now would be the exact mistake this thread has been paying for - folding a discovered finding into work already estimated against a different bar - and it would also destabilise the suite during the three sessions that must reach a live run. The user directed that it be recorded as a follow-up belonging to this thread rather than spun out.

## Options

- Clean the suite now, while the root causes are fresh
- Spin it out to a separate thread
- Keep it on this thread as a criterion sequenced after the live run

## Outcome

It lands as the LAST planned criterion of this thread, after the live end-to-end run is proven. Sequencing is binding: no test is deleted or rewritten until M16 is green and required, because the suite is the only thing standing between the engine and a silent regression while it is being changed, and M16 is what makes a post-cleanup green trustworthy. Scope when it opens, so it is bounded before it starts: retire the source-text censuses and change-detectors named in 0616, rehome the fixture scaffolding currently filed as source so the test-to-source ratio reports honestly, and consolidate the duplicated coupling and transcription suites - governed by the existing test-cleanup skill, which runs only on explicit user request and applies deletions in approved batches. It is NOT a coverage exercise and no coverage target is set. Nothing here licenses touching the suite during sessions one through three; a cleanup opportunity noticed during those sessions is filed against this criterion, never acted on.
