Waves 6 and 7 dispatched. Wave 6 SHIPPED AND MERGED; wave 7 executed to completion in the working tree but its agent stalled before committing.

## Wave 6 - merged as pull request 211, main now ffb6103f

Four commits: c8f212a1 (U6.1 engine literal), 7d3eaf45 (U6.2 rules and skills, amended once), 51fa10eb and 7c40edf3 (two defects wave 6 introduced and wave 6 fixed).

Landing verified by content, not by label: `git merge-base --is-ancestor 7c40edf3 origin/main` exits 0. The census moved from exit 41 with 18 sites to exit 0 with zero sites, all nine retiring names reported at zero. The retirement-census verb was wired into the receipts CI matrix in the same change that made it green, and passed on its first ever run.

U6.2 deleted .claude/skills/report/ entirely (SKILL.md plus three templates) per decision 0562, discharging four census sites, and repointed the four references to that skill which the census structurally cannot see.

## Three defects found by reading what the instrument does not cover

Wave 6 had a green census, six green gates and two proven inertness mutations, and was still wrong three times. None was catchable by the instrument the SPEC named.

1. PROSE FALSEHOOD, caught by reading the diff. U6.2 wrote that technical-writer "preloads visual-explainer" and could be dispatched "to render the report". Both false against .claude/agents/technical-writer.md: no skills frontmatter at all, visual-explainer arrives as a generated body pointer at :38 per decision 0503's 4 KB rule, no Skill tool in its tools line, and its body disclaims rendering outright. The wording came from decision 0481, correct on 2026-08-16 and superseded the next day by 0503. Sent back and corrected in the amend; recorded as decision 0568.

2. PARALLEL TWINS, caught by CI. U6.1 updated the derived dispatch table in agent-schema-lint.test.mjs and missed the identical assertion at mitosis-gate.test.mjs:536, plus e2e-substrate.mjs:203 and decompose-emit.test.mjs:226. All three sit under tests/, which the census excludes by declaration and discloses in its own not-attested list. Fixed in 51fa10eb; recorded as decision 0570.

3. MISATTRIBUTED FAILURE, caught by challenging two agents' classification. Both the investigator and the fixing implementer filed ci-escalation.test.mjs:92 as "pre-existing and unrelated" because neither ci-escalation.mjs nor its test appears in wave 6's diff. True and irrelevant. That test parses the live receipts.yml gate matrix at :41-53 and asserts every derived leg name classifies as enforcer configuration; U6.2 wired a sixth verb in, and CI_ENFORCER_CHECK_TOKENS at ci-escalation.mjs:12 carried only five. The test job was green on main at c8c4cad0, 94eaf17f and 639702a1, which settles causation. File unchanged, failure caused. Fixed in 7c40edf3 by DERIVING the tokens from MITOSIS_GATE_VERBS rather than appending a literal, after tracing the full 14-file transitive import closure to prove no cycle. Accepting the "pre-existing" label would have shipped a red suite with a written justification.

## Wave 7 - executed, verified, NOT COMMITTED

Branch chore/wave-7-delete-retired-agents off main at ffb6103f. The implementer reported all six gates clean and was on its final npm test run when a stall watchdog killed it at 600s with no progress. Nothing was lost; the work is staged.

Staged in the working tree: nine agent deletions plus the retirement-census.test.mjs repair. Measured directly in that tree: census exit 0, derivation.shape `retired`, derivation A empty, derivation B the nine, sites 0, 13 agent definitions on disk.

The :241 repair was done correctly, which was the hard part. That assertion was the census's corroboration requirement - two independent derivations must agree - and after a complete retirement corroboration is impossible by construction. Deleting it would have silently dropped the rule. It now pins shape `retired`, A empty, B the nine, AND asserts the retired not-attested disclosure is actually present, making the downgrade explicit and checked.

OWED before wave 7 can ship: full npm test to a zero fail counter, the two declared inertness mutations, commit, push, then a pull request through pr.mjs pr-create. Suggested title `chore(roster): delete the nine retired agent definitions`.

## Wave 7 pre-work that is already done and must not be repeated

A dedicated investigation mapped every check whose verdict changes when the nine are deleted. Result: exactly ONE breaks, retirement-census.test.mjs:241, and it is already repaired in the staged tree. All six gate verbs are pass-through. The vacuity guard at agent-schema-lint.test.mjs:144 holds at 13 > 5. Roster arithmetic is exact: 22 minus 9 equals precisely the thirteen of SPEC section 5b, verified by diff. The git grep residue clause is satisfiable as written - the only four hits outside docs and fixtures live inside performance-engineer.md:12 and codebase-analyst.md:12, two of the nine, so they delete themselves.

## Filed above the ceiling, not fixed

- agent-generate.mjs --check, run by CI at receipts.yml:78-79, plans bodies from the 13-entry spec store rather than the directory listing, so it cannot witness U7.1 in either direction. The orphan detector that would (agent-body-drift.mjs:56-58) is only ever called from a fixture test.
- The retirement census never scans .claude/agents/ for content, only for filename stems (retirement-census.mjs:108-122). A retained agent body naming a retiring agent would go uncensused. None currently does.
- technical-writer.md:14 still says the dispatching skill owns rendering and placement, stale now that the report skill is deleted. Agent bodies are out of wave 6 and 7 scope.
- The merged wave-6 remote branch refactor/wave-6-repoint-retiring-agents still exists at 7c40edf3.
- Pull request 211's provenance line reads agent=release-manager; the agent was release-engineer. Not corrected, because a pull request body is never rewritten after creation by rule.

## Operational notes

- test is NOT a required status check on this repository. Pull request 211 sat at mergeStateStatus UNSTABLE with a red suite and GitHub would have merged it on one click. The green-branch invariant is held here by convention, not by branch protection.
- An implementer ran `git stash -u` then `git checkout <parent> -- .` to inspect a parent tree and overwrote its own 17 committed files. HEAD was never affected; it recovered by explicit path and re-ran the whole suite from scratch. The instruction not to run `git checkout -- .` was added to every later dispatch.
- .claude/sounds/OptionA.mp3 has been modified and unstaged in the working tree since before this session, unrelated to any of this work, alongside untracked corrections.png and hero.png. Every agent was told to leave all three alone and every one did.
- npm test needs the pinned duckdb v1.5.5 CLI or roughly 21 audit-queries tests fail as a local-environment gap. Agents fetched it into their own mktemp scratch and pointed OBSERVER_AUDIT_DUCKDB at it.