---
Status: accepted
Date: 2026-08-06T21:12:13.095Z
Thread-Id: 01KZCAGBAH55F8AR1ZXJQT8JRP
---

# 0272. Invariant coverage cost measured: 76.3k fixed plus 2,298 tokens per row, linear and unbounded

## Context

c1 asserted the coverage tax from an estimate and flagged that the estimate was what c2 must falsify. The subject change is commit 45336f8, the mp3 re-encode that motivated the thread: two binary files, zero text lines, the canonical low-risk change. Cost had to be established as a slope in registry size, not as a single total, because the question c4 answers is how the obligation behaves as the registry grows past seventeen ids.

## Options

- Accept c1's estimate and proceed to c4 on it - rejected, the estimate is precisely what the thread said must be falsified before ratifying
- Measure one full seventeen-row entry - rejected, a single total gives no slope and cannot answer the growth question
- Vary registry size across independent arms on one fixed change and read the slope - adopted, with fixture registries at 2, 6, 12 and 17 ids and one replicate at 17 for variance
- Add a fabricated 30-id arm to measure the projection directly - rejected, filler invariants make the marginal row artificially cheap and would corrupt the slope

## Outcome

Five independent agents authored a coverage entry for 45336f8 against fixture registries of 2, 6, 12, 17 and 17 ids. All five entries were validated against the real scripts/invariant-coverage-check.mjs in pull-request mode through a fixture git harness, so the measurement is of valid artifacts. Token cost is linear: 76,292 fixed plus 2,298 per row, R-squared 0.995. At 17 ids a low-risk PR costs 114,711 tokens of which 33.5 percent is the obligation; at 30 ids the slope projects about 145,000 tokens and 47.5 percent. Prose grows about 74 words per row, so roughly 1,400 words today and 2,400 at 30 ids, confirming c1's estimate in shape. Three findings bear on c4. First, wall-clock is not measurable here and is retired from the argument: two identical 17-id runs took 394s and 1055s, a 2.7x spread, at identical tool counts and tokens within 3.8 percent. Second, grounding thins as the registry grows, with tool calls rising at only 0.64 per added id and calls-per-row falling 4.50, 2.17, 1.33, 1.12; this supports c1's fabrication argument as a gradient but does NOT demonstrate it, since no fabricated row was found and some amortization is legitimate. Third, the prose rows are not reproducible: the two 17-id runs disagreed on 2 of 17 verdicts, M4 and M5. Counter-evidence against the thread's own thesis, recorded because it is load-bearing: the obligation caught a real defect the cheap arms missed. Verified independently with ffprobe, the re-encode cut both sounds to under half their duration, OptionA 4.545s to 2.116s and OptionD 2.325s to 0.950s. Only runs reaching the M-block measured the audio at all. This survives c3's shape only because M3, M4 and M5 are carved out as always-prose, which upgrades that carve-out from intuition to a measured requirement. Limits: one change, one repo, n=1 per arm except n=2 at 17 ids, and the 30-id figure is extrapolation on a measured slope rather than a measured point.
