---
Status: accepted
Date: 2026-08-18T19:56:56.365Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0588. Stop-only rows are a 99-to-1 mixture, so the 88-point attribution gap was a denominator artifact

## Context

D1 asked whether the stop-only rows are artifact-less internal firings or real dispatches whose start rows were dropped, because the two readings differed by roughly 88 points of attribution coverage. Answer: a quantified mixture, overwhelmingly lopsided - 2631 of 2654 ids (99.13 percent) are artifact-less, 23 (0.87 percent) are real dispatches with dropped starts. Three findings carry it. The writer copies agent_transcript_path verbatim from the hook payload and never stats the file, so a non-null path means only that the harness supplied a string; corroborated by SubagentStart rows carrying ZERO non-null transcript paths across all 461, which makes that field a stop-row marker rather than a dispatch signal. The same script is registered on both SubagentStart and SubagentStop as independent async fire-and-forget hooks with errors swallowed, so a stop is written whether or not a start ever was - and SubagentStart emitted nothing at all before 2026-08-17T19:00Z while 201 stops landed. The 23 real ones carry both a sidecar and a substantial transcript, one running 970 lines and 2.4 MB with 224 Bash calls. Transcript and sidecar are co-present or co-absent across all 2930 ids with zero counterexamples, and a live session showed 13 artifact-less stops sitting beside 20 complete pairs in the same directory, which excludes cleanup.

## Options

- Treat the whole stop-only mass as artifact-less, as the measurement's label assumed
- Treat it as dropped starts, which would make the observer's coverage catastrophically bad
- Quantify the mixture and let the proportion decide what each clause of c5 rests on
- Keep the shipped predicate as the final answer rather than refining it again

## Outcome

The mixture is quantified and the 88-point swing does NOT materialise: attribution must not be reduced by the 99.13 percent, because those were never dispatches to attribute. The corpus-wide 11.46 percent recorded in 0584 is therefore a DENOMINATOR ARTIFACT, not an observer defect, and the same applies to the 89.47 percent stop-without-start figure. Within the measured window attribution is 100 percent over real dispatches, so c5's attribution clause is met there. Two things are NOT waved away. There is a genuine dropped-start population of at least 23, and a regime before 2026-08-17T19:00Z in which the start hook emitted nothing while stops landed, so any coverage figure spanning that boundary measures two regimes and must not be quoted as one. The predicate shipped in PR 217 needs a second pass: it still admits all 2631 artifact-less rows as dispatch, because it tests transcript non-nullity among its signals. The correct discriminator is depth IS NOT NULL, since depth is populated only from a sidecar that exists solely for genuine Task dispatches. That refinement is HELD until 217 merges rather than stacked on a live base branch. One honest gap remains speculative: a near-metronomic 31 to 32 second signature over 275 rows with a fresh agent id each, whose emitting mechanism was not identified - the label internal firings names a category consistent with the evidence, never a mechanism.
