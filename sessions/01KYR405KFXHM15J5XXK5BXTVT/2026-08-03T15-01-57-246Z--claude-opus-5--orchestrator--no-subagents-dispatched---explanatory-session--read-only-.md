EXPLANATORY SESSION. Nothing was written to the repo. HEAD stayed at 4fd03c2 throughout; `git status` showed only the five pre-existing dirty paths already named in the spine.

WHAT SHIPPED
1. Delivered the recorded task: an explanation of M8's ten invariants I1-I10 for a minimal-domain-knowledge reader — what an invariant is, why mitosis plans invariant-first, each invariant, and each one's mechanism plus the test that reddens if the mechanism is deleted. Every anchor re-derived against 4fd03c2, none copied.
2. Answered a follow-up: the user ran mitosis against a target repo and the merge-boundary preflight halted with invariants "1, 2, 3 + bypass", which do not match I1-I10. Explained the mismatch and grounded it in code.

THE RECOVERY FINDING THAT MATTERS MOST. The spine's risk "M8 WORKFLOW ARTIFACTS ARE EPHEMERAL" was true of the /private/tmp scratchpad but NOT of I1-I10 themselves. The prior session transcribed all ten, verbatim, into a durable index inside the _ledger git ref. Retrieval, which cost one command:
  git show "_ledger:sessions/01KYR405KFXHM15J5XXK5BXTVT/2026-08-03T07-33-59-591Z--claude-opus-5-orchestrator--durable-index-for-the-next-session-.md"
General form for a fresh session that does not know the filename:
  for f in $(git ls-tree -r --name-only _ledger); do git show "_ledger:$f" | grep -q '<TOKEN>' && echo "$f"; done
That pattern is the recovery route for any ephemeral-scratchpad content a prior session bothered to transcribe. This session log continues that practice deliberately — see the GROUNDING block below.

Second durable source, also committed and also not ephemeral: docs/invariants/coverage/feat-m8-ci-to-green-loop.json, added by 4fd03c2, carrying M8's twelve registry verdicts with their reasoning.

THE FOUR-FAMILY TAXONOMY (the conceptual output of this session). "Invariant" names four disjoint families in this project. They are not one numbered list and no row appears in two:
  - Preflight 1, 2, 3 + bypass — properties of the TARGET repo's permissions and branch rules; checked before the engine dispatches anything; .claude/lib/superpowers-parallel/merge-boundary-preflight.mjs
  - I1-I10 — runtime behavior of the CI-to-green loop; properties of the engine's own source; ci-escalation.mjs + the mitosis.js twin
  - B1-B6 — the sandbox that runs the workflow; docs/invariants/registry.json
  - M1-M6 — the method by which changes are made and proven; docs/invariants/registry.json
The link worth carrying: I4, I5 and I6 all ASSUME a human merge gate exists (append-only because a human is reading; never assert green; a reported merge is CI_HUMAN_GATE_KIND). The preflight is what PROVES that assumption holds in the target repo. That is why its halt is unconditional — an unprovable gate leaves those three runtime invariants resting on nothing.

THE USER'S OBSERVED FAILURE (the motivating case for the next session). Running mitosis on SatanshuMishra/logbook, base feat/preflight-briefing at 29b1eaa, the preflight exited 30:
  - Invariant 1 (identity is the machine user): PASS — credential authenticates as exactly SatanshuMishra.
  - Invariant 2 (machine user is not a repo admin): HALT x2 — the repo capability map and the collaborator read BOTH report admin.
  - Invariant 3 (base requires an approving review): HALT x2 — no pull_request rule on the base carries a required_approving_review_count.
  - bypass list is empty: UNVERIFIABLE — GitHub returns bypass_actors only to a caller with write access to the ruleset, and granting that would let the engine edit its own boundary.
The crux, stated to the user and worth re-deriving rather than trusting: invariant 2 can NEVER pass on a repo the operator owns with their own credential, because an owner is necessarily admin. That is structural, not a misconfiguration. Invariant 3 is separate and genuinely fixable.

WHY THE HALT TABLE HAS 4 ROWS BUT ONLY 3 NUMBERS. Several checks share one invariant number, which is what produces "HALT x2" twice. Verified in code today.

GROUNDING FOR THE NEXT SESSION'S TASK — anchors I RE-DERIVED MYSELF at 4fd03c2, in .claude/lib/superpowers-parallel/merge-boundary-preflight.mjs:
  :18   PREFLIGHT_PROBES = ['identity','repository','collaborator','branch-rules','rulesets']
  :20-27 PREFLIGHT_CHECK_IDS — seven ids: configuration, identity, admin, collaborator, review, ruleset, bypass
  :29   HANDLE_PATTERN (GitHub login grammar)
  :39-41 check(id, invariant, required, passed, detail) — the frozen row factory; `invariant` is the NUMBER, `required` marks whether the row gates or merely corroborates
  :135  readFailure — "an empty answer proves no invariant"
  :147-156 invariant 1, identity; note the :156 caveat that it proves only the credential THIS process resolved, and every later agent resolves its own
  :162-174 invariant 2 via the repository permissions capability map; :166 absent map is not a proven non-admin; :169 absent boolean key is not a proven false; :172 admin=true is the halt
  :180-193 invariant 2 via the collaborator read, required=false (corroborating only); :188 positive admin contradicts the map; :191 disagreement between the two reads yields neither as proven
  :234-240 invariant 3; :237 insufficient approving-review count; :240 require_last_push_approval not exactly true, so an approval survives later pushes
  :327-330 configuration check, invariant null
  :357-358 PASS / HALT report lines
  :360  scope rendering: invariant === null renders as "advisory", which is why bypass reads UNVERIFIABLE and not HALT
  :396  process.exitCode = runPreflightCli(...)
Mapping established: invariant 1 = {identity}; invariant 2 = {admin, collaborator}; invariant 3 = {review, ruleset}; bypass = advisory (invariant null); configuration = advisory-shaped gate on missing input.

WHAT I DID NOT READ, stated candidly so the next session does not inherit it as established:
  - the bypass check body and how bypass_actors visibility is actually probed
  - the ruleset check body (the `review-ruleset-is-repository-owned-and-active` half of invariant 3) — I confirmed only that :234-240 carry invariant 3
  - the attestation mechanism referenced at :327
  - the derivation of exit code 30 specifically; the user's report names it, I never confirmed it in source
  - any test file. Both .claude/lib/superpowers-parallel/tests/merge-boundary-preflight.test.mjs and tests/mitosis-gate.test.mjs exist and were never opened, so the "test that reddens" half of the next explanation is entirely UNDERIVED.
  - whether merge-boundary-preflight.mjs is a mirror-guard twin; it appears in the grep hit list for both mitosis.js and mirror-guard.test.mjs, which is suggestive and unproven.

FORMAT DIRECTIVE FOR THE NEXT SESSION, carried forward from the user and reaffirmed this session: concise, SMALL PARAGRAPHS not walls, assume MINIMAL domain knowledge, define every term on first use. The I1-I10 delivery that the user accepted used this shape: (1) a short vocabulary block, (2) what an invariant is, (3) why this system is planned invariant-first, (4) per invariant, the plain statement plus mechanism plus the test that reddens, merged into one pass rather than two, (5) an honest footer naming what is unpinned or unverified. Reuse that shape.

NOTHING LEFT RUNNING. No background shells, no subagents, no worktrees created or touched.