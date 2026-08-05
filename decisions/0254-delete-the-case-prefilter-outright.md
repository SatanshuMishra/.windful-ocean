---
Status: accepted
Date: 2026-08-05T23:24:52.017Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0254. Delete the case prefilter outright rather than make it fail-closed

## Context

Fail-open path (a) of threat model section 6 row 3 was the case prefilter that exited 0 on any input missing all of rm/git/gh/dd/mkfs/fork-bomb/dev-redirect/.claude, before any analysis. Its stated purpose was avoiding a python3 spawn per Bash call. Empirical check of a real PreToolUse payload showed transcript_path is always under ~/.claude/projects/..., so the .claude arm matched every production input and the prefilter had never once short-circuited in production. It only fired under the test harness, which sent a bare tool_input object with no transcript_path. That divergence was itself live: a spaced fork bomb was a silent allow under the old gate plus minimal payload and an ask under the same gate plus a realistic payload.

## Options

- Delete the prefilter; every input reaches the analyzer
- Keep it but route its exit through the explicit no-opinion token and add a test that every downstream matcher trigger survives it
- Rebuild it as a single regex constant defined next to the matchers so the two cannot drift

## Outcome

Deleted it. It bought no measured production performance and was a standing landmine for c4/c5/c6, whose new matchers for chflags, curl and other network commands would have been silently dead had their substrings not been mirrored into the prefilter list. A corpus-wide test now asserts the verdict is identical under rich and minimal payloads, so reintroducing any prefilter fails the suite. The test harness was also corrected to send realistic payloads.
