---
Status: accepted
Date: 2026-08-20T22:14:12.589Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0649. The test suite is narrow rather than wasteful, so pruning is not the lever that makes tests mean something

## Context

The pending cleanup criterion assumed the suite was full of waste: source-text censuses, change-detectors, fixture scaffolding in source, duplicated coupling and transcription suites. The user sharpened the bar to a two-part test - a test earns its place if its green says something true about live behaviour OR its red would indicate a real defect - and asked for everything failing it to be pruned. Two independent passes were run against that bar. The first classified all 124 mitosis test files and found one deletion, a self-referential census duplicate. The second deep-read the five largest files, 4700 lines, hunting the named disqualifying patterns specifically, and found none: each apparent duplicate tested wiring the lower layer structurally cannot reach, and the one test that looks like a change-detector pins a durable run identity key whose silent change would break resumption. Meanwhile five real engine defects were found in a single day by live runs and the new lanes, and none by the suite.

## Options

- Continue pruning in further batches until a large number of files are gone
- Delete aggressively anything whose green is weak, accepting the loss of real deny-cases
- Accept the measured verdict, stop pruning, and put the effort into the end-to-end lanes

## Outcome

The premise is retired on evidence. The suite is not mostly wrong; it is mostly narrow - almost every file would go red on a real defect, but only in the one function it covers, which is exactly why 37,600 lines caught none of the defects that live runs found. Deleting more would not have caught them either, so pruning is not the lever. The lever is the end-to-end instrument, and the zero-cost smoke lane is what makes running it cheap enough to be habitual. Two items survive as housekeeping rather than correctness: four fixture modules sit in the production directory, and their full reference graph terminates in three test files, so relocating them is provably zero-risk but buys no trust. Any future pruning is filed per-file with a stated reason against the two-part bar, never as a sweep.
