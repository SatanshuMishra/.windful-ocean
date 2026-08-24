---
Status: accepted
Date: 2026-08-24T00:57:52.413Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0694. Adding fixture-backed tests is ruled out as the response to a mitosis defect

## Context

The intuitive response to repeated live-run failures is more test coverage, and it has been tried at scale. The suite is roughly 35,755 test lines over 24,570 engine lines, with 364 testing commits and net churn of +59,800 / -18,876 test lines in thirteen days. It did not prevent the failures. The reason is structural rather than a matter of volume: claude, gh and eslint are all replaced by generated fake binaries, no test spawns a real claude or gh, cassette.mjs permits hand-authored scripts of what a model would have said, and fixtures are generated from the same source they check. Where a stand-in is authored from the same source as the code under test, the suite cannot disagree with the engine. A predictiveness census over 130 test files returned 127 predictive, 3 decoration, 0 rewrite, and deleted one file of nine lines, because the always-succeeds stub it was meant to catch lives outside the census population.

## Options

- Add more tests targeting the failing areas - the intuitive move, already tried at scale, and ruled out by the measured result.
- Delete the low-value tests first, then add better ones - attempted as its own unit; the census could not see the offending stub and deleted nine lines.
- Stop answering defects with fixture-backed tests and instead buy free contact with the real surfaces the engine actually depends on.

## Outcome

Do not answer a mitosis defect by adding fixture-backed tests, and do not treat suite size or coverage as evidence of anything. The operative question for any proposed check is whether it makes contact with a real surface - claude, gh, or real CI - or whether its stand-in is authored from the same source as the code under test. A check of the second kind may still be worth having for ordinary logic, but it is never evidence about live behaviour and must not be cited as such. This is the reasoning behind the tiered lane design in 0693: interface fidelity is bought on a schedule against real surfaces, content determinism is bought per pull request by replay, and an authored cassette is refused at load time unless it names a real capture it validates against. Corollary for a future session: a green suite is not a reason to believe a live run will work until the lanes from 0693 exist.
