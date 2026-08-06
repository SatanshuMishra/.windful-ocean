Thread opened at the tail of the gate thread, after c7 shipped G1-G5 and grew the registry from 12 ids to 17, which raised the per-PR obligation to seventeen evidenced verdicts including six about a JavaScript sandbox on a pull request that re-encodes two mp3 files.

c1 — the enforcement chain, mapped end to end and verified against the code, not summarized from memory:

docs/invariants/registry.json is the question list: 17 {id, statement, source} records (B1-B6 sandbox, M1-M6 method, G1-G5 bash gate). It only grows. docs/invariants/coverage/*.json are answer sheets, one per change, branch-named; 23 exist. scripts/invariant-coverage-check.mjs is the entire enforcer at ~230 lines with zero dependencies. .github/workflows/test.yml runs it as its own invariant-coverage job with fetch-depth 0, on both push and pull_request.

The checker is closed at every seam: an empty or missing registry hard-fails so an empty id universe can never pass entries vacuously; a non-.json file in the coverage directory hard-fails because the directory admits nothing else; every entry always gets shape, verdict-domain, non-empty-check, duplicate and unknown-id validation; completeness ALONE is scoped to the entries a change touches, per 0264 this morning; pull-request mode hard-fails an unresolvable base and hard-fails a PR touching no coverage file.

The obligation is generated at exactly one line - the missing-id filter in validateCoverageEntry. Registry growth converts directly into per-PR cost, linearly, with no upper bound. That single line is the whole subject of this thread.

c3 — drafted, NOT ratified. Proportional coverage does not NECESSARILY reintroduce the self-selected allowlist, on two conditions. First, the predicate must be a property of the INVARIANT, declared in registry.json, never a property of the change - a change must not be able to nominate what it is judged against. Second, the polarity must be inert: the basis holds only if EVERY changed path matches a declared-inert glob, so an unenumerated path falsifies it and forces human prose. That is halt-on-the-unclassifiable, which satisfies M2 rather than evading it.

Recommended shape, pending the user's ratification: a registry entry may carry inert_when {paths: [glob], absent_tokens: [regex]}; a row may then be basis "inert" instead of prose, and the checker PROVES it against the diff it already computes. Absent field means that id always requires prose, which is correct for the judgment invariants M3, M4 and M5. In practice the seventeen fields collapse to roughly two shared path-sets.

The decisive argument against changing nothing is honesty rather than effort: at 30 ids, thirty paragraphs per PR makes the fabricated "I grepped it" row the cheapest path, and the gate cannot see the difference - volume manufactures exactly the unrun check that the pr-create honesty rule and 0264 both exist to prevent. Tiering (a standing verdict a change must rebut) was rejected as worse: silence becomes a pass and the N+1th path is silent by construction.

Also noted: the change would RAISE the assurance floor, because CI today verifies that a verdict exists and never that it is true; inert rows become CI-proved facts.

Not done and not started: c2's cost measurement (the numbers above are an estimate, explicitly not a measurement), c4's ratified decision, c5's implementation.