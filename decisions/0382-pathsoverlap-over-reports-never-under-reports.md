---
Status: accepted
Date: 2026-08-12T22:24:51.117Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0382. pathsOverlap may over-report overlap and must never under-report

## Context

pathsOverlap is the single predicate behind wave scheduling, derive-edges, MSP clustering and lease conflict detection, so one wrong answer defeats all four at once. It was hand-rolled prefix truncation, not a glob engine: an index-0 wildcard produced an empty prefix that matched nothing, a forced `/` separator defeated a mid-segment star, and normalize stripped only one leading ./ and trailing slashes. Six spellings of one file, and the broadest possible scope, all read as disjoint. The matcher was inherited from superpowers-parallel, ring-fenced as untouched by design, then adopted as the parallel-safety invariant without ever being reviewed on its merits.

## Options

- Leave it and log an accepted risk, since no committed graph file uses a defeating shape today
- Defer to SPEC D2, which deletes mitosis.js and halves the fix cost by removing the mirror obligation
- Fix on main as a standalone PR ahead of A1, adopting an explicit directional contract
- Vendor a real glob library such as picomatch

## Outcome

Fixed on main as PR #71 under an explicit contract: pathsOverlap MAY over-report overlap and MUST NEVER under-report. Over-reporting only serializes work that could have run in parallel, a throughput cost; under-reporting puts two agents on one file, a correctness cost. Every choice resolves that way, including dropping a .. that escapes the root. A glob library was rejected because the mirrored copy runs in the Workflow sandbox, which denies require, module and dynamic import, so node:path and any dependency are unavailable; canonicalization is pure string work. Deferral was rejected because main already shipped two todo tests stating the desired contract, and leaving it unfixed means shipping a contract nobody intends to meet. Residual gaps after the fix — no brace expansion, no * versus ** depth distinction — all over-match, so they fail safe.
