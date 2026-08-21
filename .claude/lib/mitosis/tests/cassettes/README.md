# Cassettes

A cassette is a JSON file that replays a scripted sequence of dispatch
responses, loaded and validated by `../../cassette.mjs`. It has one
required field that governs how much trust the cassette is owed:
`provenance`.

## `provenance: "recorded"`

Harvested from a real, billed run of the engine against a real model.
`sourceRun` names the run it came from and may never be null — a
`loadCassette` call rejects a recorded cassette that does not say where
it came from. A recorded cassette is evidence of what a real model,
under real conditions, actually returned.

## `provenance: "authored"`

Hand-written from the closed vocabularies the engine itself enforces
(dispatch outcomes, verdict enums, dispatch kinds — see
`../../cassette.mjs`'s `DISPATCH_OUTCOMES`, `DISPATCH_KINDS`,
`PLAN_REVIEW_VERDICTS`, `JUDGMENT_VERDICTS`). `sourceRun` is null.

An authored cassette is evidence of exactly one thing: what the engine
does when a dispatch returns a response of that shape. It is never
evidence of what a real model does, would do, or is likely to do. A
model rejecting a plan twice before approving it is a real, measured
behaviour only when it comes from a `recorded` cassette; the identical
byte sequence in an `authored` cassette is a claim about the engine's
branch coverage and nothing else.

Do not read test names, fixture comments, or prose elsewhere as
softening this line. If a cassette's `provenance` is `"authored"`, the
only claim it supports is "the engine took this branch when handed
this input."
