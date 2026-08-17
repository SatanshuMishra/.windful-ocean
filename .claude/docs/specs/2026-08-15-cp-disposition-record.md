# CP disposition record

Status: CP complete; every obligation in the inventory carries a disposition
Date: 2026-08-15
Authority: decision 0424 (CP is inserted before C7), decision 0449 (CP's three open questions ratified)
Companion to: `.claude/docs/specs/2026-08-15-mitosis-porting-msp-scope.md`, whose section 6 acceptance criteria 1 and 2 this document discharges

Criterion 1 requires every drainable obligation to be discharged in code or explicitly re-filed with a named owner and a reason. Criterion 2 forbids resurrecting the deleted arrays as census apparatus, so the tracking lives here as a document rather than in a module whose purpose is to verify other verification code.

## 1. Outcome

Twenty-four drainable obligations, all disposed. Nine discharged with receipts, six already satisfied, nine re-filed to C7, one retired. `C7-B4` is confirmed to still carry no work.

| Disposition | Count | Ids |
|---|---|---|
| Discharged with a receipt | 9 | R1, R2, R3, R4, R5, T6, J5, B3 (in-fence half), C5-O4 |
| Already satisfied | 6 | R6, T2, J3, J4, J6, J7 |
| Re-filed to C7 | 9 | R7, T1, T4, T5, B1, B2, B3 (remainder), J1, J2 |
| Retired | 1 | T3, by decision 0449 |
| Marker, no work | - | B4, confirmed unchanged |

Four of the six already-satisfied obligations were unpinned decisions and now carry characterization tests: R6, J3, J4, J7.

## 2. Disposition detail

| id | disposition | evidence |
|---|---|---|
| R1 | discharged | data blocks render inside delimited regions whose heading declares them data; `tests/cp-prompt-data-blocks.test.mjs` |
| R2 | discharged | fence and return contract restated after every model- or tool-produced block; same test file |
| R3 | discharged | every value reaching a command position is shell-quoted; `tests/cp-prompt-command-quoting.test.mjs` |
| R4 | discharged | the edit pathspec list has one spelling in `prompt-execute.mjs` |
| R5 | discharged | `scopedCheckCmd` is argv, rendered quoted; a bare string is refused |
| R6 | already satisfied | `prompt-contract.mjs:246-251`; the halt is kept, now pinned |
| R7 | re-filed C7 | inline twins live at `mitosis.js:1476` and `run-engine.mjs:392`; nothing outside tests imports the registry |
| T1 | re-filed C7 | Integrate dispatches live at `run-engine.mjs:613,620,623`; the precondition "when the wiring lands" is unmet |
| T2 | already satisfied | `tests/mirror-guard.test.mjs:31`; see the caveat in section 4 |
| T3 | retired | decision 0449; its intent is carried by T4's per-kind expectation |
| T4 | re-filed C7 | removing a converted site's dispatch edits `mitosis.js:4279` and `run-engine.mjs` |
| T5 | re-filed C7 | `ci-fact-extract` registered at `prompt-registry.mjs:37` and `prompt-contract.mjs:226`; dispatching it needs sandbox-external wiring |
| T6 | discharged | bounded fail-closed spec reader; `tests/cp-transcription-spec-reader.test.mjs` |
| B1 | re-filed C7 | mechanical dispatches at `mitosis.js:1758-1760` and `:1768-1770`; the verdict must be injected through a hook |
| B2 | re-filed C7 | `run-engine.mjs:576-636` is the verbatim twin; nothing to re-sync until B1 lands |
| B3 | discharged in part, remainder re-filed C7 | identity stamped on publish at `boundary-gate.mjs`; the remainder deletes the model census at `mitosis.js:1768-1770` |
| B4 | marker | `boundary-fix` unchanged at `mitosis.js:1765-1767`, registered judgment kind at `prompt-contract.mjs:33`, `:200` |
| J1 | re-filed C7 | the six dispatches have no write capability to convert to inside the sandbox |
| J2 | re-filed C7 | the module half is done at `journal-store.mjs:169-172`, `:323-336`; the caller wiring is C7's |
| J3 | already satisfied | asymmetry preserved at `mitosis.js:4708` against `:4733/:4792/:4814/:5596`, now pinned |
| J4 | already satisfied | `.mitosis/run.json` kept as the fold base; `fold-run-log.mjs:6-15`, `mitosis.js:4138`, `run-store.mjs:321-337` |
| J5 | discharged | the ignore entry is derived at the write path; `tests/journal-store.test.mjs` |
| J6 | already satisfied | `persistShipCheckpoint` fires only from reconcile; asserted at `mitosis-scheduler.test.mjs:683`, `:714`, `:1132` |
| J7 | already satisfied | refuse none; every live fingerprint is colon-shaped at `mitosis.js:2431-2433` |
| C5-O4 | discharged | `couplingResolution` carried as a top-level engine arg with an integrity check keyed to the carried decision |

Every discharge carries an acceptance test red on its parent commit, green on its commit, and at least one inertness mutation observed directly by the lead that shipped it. Two lanes ran a security review: the command-quoting pair, and the data-block fencing, which surfaced one HIGH (a padded or LS/PS-terminated heading could forge its own closing delimiter) fixed before the PR opened.

## 3. The C7 re-file inventory

C7 inherits nine obligations. Each is blocked on the same thing: the caller is a sandboxed workflow script, and the conversion completes only once it is a process.

R7, T1, T4, T5, B1, B2, B3-remainder, J1, J2 — call sites in the table above.

## 4. Why the drain is partial, and what expires

The sandbox is not a permanent constraint. The parent SPEC's target is a deterministic Node process that owns the control loop and reaches a model only at the nine judgment kinds (`2026-08-12-mitosis-os-process-rearchitecture-design.md:98`), and D2 removes `.claude/workflows/mitosis.js`, `.claude/lib/mitosis/workflow-sandbox.mjs`, the four sandbox test files and `tests/mirror-guard.test.mjs` (`:550`). An obligation phrased as "port this dispatch onto the substrate" is therefore not blocked forever; it is downstream of the process move.

CP drained what was drainable before that move. Everything it shipped lands on the surviving library substrate, which the SPEC states is not sandbox-coupled (`:119`).

Two consequences to carry, both of which expire at D2 rather than now:

1. **T2's basis expires.** T2 is already-satisfied partly because `mirror-guard` makes the one-sided-edit hazard red. D2 deletes `mirror-guard`. Re-check T2's disposition when that happens rather than assuming it still holds.
2. **The coupling carrier has a doomed copy.** C5-O4's change is mirrored into `mitosis.js` to keep `mirror-guard` green under the twin rule. That copy dies at D2. It is a green-branch obligation of today, not a design position to defend later.

## 5. Findings above the ceiling

Filed under CP's acceptance ceiling, not folded into it. None is fixed here.

| Finding | Owner |
|---|---|
| The prompt registry has no production importer; hardening it changes no live behavior until the engines compose through it | C7 |
| `plan` ignores `fileScope.truncated` entirely, so a dropped path is invisible to the planner | C7 |
| An empty `fileScope.edit` composes a diff with no pathspec, which git reads as no filter, silently widening the review target | C7 |
| `fencedExcerpt` truncates after validation, so a cut can manufacture a delimiter-shaped final line | C7 |
| A backtick inside an argv element still closes the markdown code span early; reduced by R5, not eliminated | C7 |
| `boundaryFixWhere`'s restatement re-emits only part of the fence it claims is unchanged | C7 |
| The deterministic writer refuses records the prompt path drops, so a converted genesis write throws where the incumbent proceeds | C7 |
| The scheduler's absent-dispatch-label assertions go vacuous at conversion and stop guarding J6 | C7 |
| `makeDurableFakeAgent`'s in-memory file map simulates the journal by parsing a prompt and has no meaning once the write is deterministic | C7 |
| `censusIdentity` hashes the census's own fields, so it authenticates nothing against the tree, while its refusal text claims it binds one | C7 |
| `usableCachedBase` recomputes expectations against a base worktree `collectSides` has already torn down, making the cache unreachable in that case | C7 |
| `specHashProbes` exercises only an inline throwing stub, so the gate verb proves nothing about the real reader | C7 |
| The engine has no coupling consumer beyond the integrity halt; whether it should is a decision, not a defect | D1 |
| The nine task fields and their prompt-literal copy remain unbound to each other | D1 |
| `planWaves` has no task-shape validation and reaches for `t.id` on a null element | unassigned |

## 6. A recurring fail-open class

`generate-run-script.mjs` tolerates a graph that never went through `deriveEdges` by falling back to an empty coupling resolution, which silently disables the integrity check on that path. The mitosis flow itself is fail-closed; this fallback is not.

This is the third instance of one class in this thread. The scalar `fileScope` fail-open and the `pathsOverlap` glob and canonicalization fail-open each shipped as a standalone PR. The shared shape is a defaulting expression on a security- or ordering-relevant input, which converts a missing value into a passing check rather than a halt.

It is named here as a class so the D-series does not reintroduce it, and filed as its own item rather than folded into CP.

## 7. Verification

Each of the six CP pull requests reported `npm test` exit 0 and all four gate verbs exit 0 at its own tip, with exit codes read from a redirected run rather than a pipe. Content presence on `feat/mitosis-os-process` was asserted by file for every merged pull request rather than inferred from a MERGED status.

Nothing in CP reaches `main`. The release gate stands: the base merges only if D3 clears its falsifier.
