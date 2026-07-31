# Two-track invariant plan: plugin hooks self-heal (Track A) and workflow sandbox harness (Track B)

Source directive: ledger decision 0134 (halt the implementer-review fix rounds; plan both tracks up front against one shared invariant set before any further code).
Produced: 2026-07-30, by a dedicated Fable planning agent, read-only, no code.
Status: proposed, awaiting ruling.

## 0. Ground truth

Everything below was checked against the live trees on 2026-07-30. Commands and results are stated; anchors were re-derived at cite time per ledger 0128.

**Track A — `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin`, branch `fix/hooks-prior-path-self-heal` @ `5bc19a4`.**

- `git log origin/main..HEAD` shows 11 commits: the base reconcile `2e91b33` + `f8a694b` + `3c6f717`, then the five self-heal rounds `12f8de2 … 5bc19a4`. `git merge-base --is-ancestor 2e91b33 HEAD` -> true. So this branch already contains the capture-race fix that only exists as a hand-patch in the deployed cache. Branch base `23b2557` is on `origin/main`.
- Round 3 is real: `hooks/lib/installer.mjs` is 135 lines (read in full), split into `managed-hooks-identity.mjs` (88), `git-config-scope.mjs` (126), `prior-hooks-path.mjs` (259), `hook-names.mjs` (21).
- **E1/E2 root defect is structurally gone.** The pre-fix probe existed: `git show 942d5f8:hooks/lib/installer.mjs` has `MANAGED_DISPATCHER_MARKER = 'continuity.priorHooksPath'` (line 59) and a fallthrough `readFile(join(dir,'pre-commit'))` -> `probe.includes(MANAGED_DISPATCHER_MARKER)` (lines 89-90). At HEAD, `managed-hooks-identity.mjs` reads only the sentinel `.continuity-managed-hooks` (line 20) and decides by realpath equality (`:40-41`), plugin-owned path shape (`isPluginOwnedHooksDir` `:53-68`, gated on `parts.length === 2 && isProjectKey(parts[0]) && parts[1] === MANAGED_HOOKS_DIRNAME`, `:67`), and a sentinel whose declared realpath equals the dir's realpath. No hook-body content is read anywhere. Grep for content/substring probes returns only the sentinel read.
- **E4 fix present.** `prior-hooks-path.mjs:86-98` `readEffectivePriorHooksPath` counts per effective origin: `count: pairs.filter((pair) => pair.origin === effective.origin).length` (`:95`), reading all scopes via `readOriginValuePairs` (`git-config-scope.mjs:90-104`, `--get-all --show-origin`), so multiplicity is per-scope, not cross-scope.
- **E3 fix present.** `hooks/dispatcher:10-16` `continuity_gating_hook` special-cases `post-index-change) return 1` and `reference-transaction) [ "$hook_state" = 'prepared' ] || return 1`, and the prior hook is exec'd unconditionally at `:50-53`. The round-2 dispatcher (`git show fde6f46^:hooks/dispatcher`) had `reference-transaction|post-index-change) return 1`, so on the self-reference/dangling early-exit paths (`:42-49`) the warn was suppressed and the prior gating hook was silently skipped. `test/unit/hooks/reference-transaction-gate.test.mjs` now asserts the gate holds when the prior runs (`:70,80,81`) and the skip is reported when it cannot (`:84,100`).
- **Disclosed residual confirmed by trace, not run:** a user's real external hooks physically located at `<dataRoot>/<dashed-name>/githooks` satisfies `isPluginOwnedHooksDir` (projectKey collision — any absolute path yields a dashed key, and `isProjectKey` only requires the charset plus a dash), so it is classified managed and declined at capture, but now written to `continuity.priorHooksPathDeclined` and emitted by `captureReportLine` (`session-start.mjs:46-52`). Reported, not silent.
- **Not run:** the 692-test Track A suite; the E1-E4 differential fixtures against the round-1/round-2 commits. Those "red on pre-fix" claims are reasoned from reading the historical source (`942d5f8`, `fde6f46^`), not executed.

**Track B — `/Users/satanshumishra/Documents/DevLabs/.windful-ocean`, branch `feat/workflow-sandbox-harness` @ `e40a292`.** Three commits over base `12053dc`.

- `node --version` -> v26.4.0; `vm.constants.DONT_CONTEXTIFY` exists (Symbol).
- **E6 reproduced live.** With the harness as written (`workflow-sandbox.mjs:114` `createContext({})`), running `compileWorkflow("return constructor.constructor(\"return process.cwd()\")();")({})` returned the real host cwd. All nine bare identifiers (`toString`, `hasOwnProperty`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `__defineGetter__`, `__lookupSetter__`, `constructor`) resolve to host-realm values.
- **DONT_CONTEXTIFY closes it — verified live.** Replicating the exact `compileInSandbox` pipeline (installer + prune) against `createContext(vm.constants.DONT_CONTEXTIFY)`: `constructor.constructor("return process.cwd()")()` -> `ReferenceError: process is not defined`; `typeof process` via the compiled probe -> `"undefined"`.
- **Object.freeze(Math) — reproduced live** as an untagged `TypeError: 'ownKeys' on proxy: trap result did not include 'random'` (not a `SandboxViolationError`). Cause: `guardedBinding.ownKeys` filters `random` (`:106`) while the target still owns it.
- **Guarded set/delete over-denial — reproduced live.** `Math.ceil = 1` and `delete Math.ceil` both throw tagged `[Math.ceil]` violations even though only `random` is a denied member; `guardedBinding`'s reject traps (`:96-98`, `:107-109`) fire for every property unconditionally.
- **Inert constants — confirmed.** On a `createContext({})` realm global, `undefined`/`NaN`/`Infinity` are `configurable:false` (probed), so the installer's `if (descriptor && descriptor.configurable) delete` (`:58`) can never remove them; emptying `VALUE_GLOBALS` (`:23`) changes nothing. `ALWAYS_DENIED` (`:25-27`) is only ever consumed by `new Set(ALWAYS_DENIED)` in `retainedNames` (`:66`) to filter `ALLOWED_GLOBALS + VALUE_GLOBALS`, none of whose members appear in `ALWAYS_DENIED`; emptying it is a no-op. Pruning is "not in retained", never "in ALWAYS_DENIED".
- **Vacuous dead-export pass — confirmed.** `compileWorkflow` (`:199`) has zero real callers; grep finds it only at `:181` and `:184` inside two `TypeError` message strings. `dead-export-lint.test.mjs:37-45` counts identifier occurrences in raw source (strings included) and excludes the `tests/` glob, so those two strings keep it live. `grep -rn` for `workflow-sandbox` across the repo returns only the module, its test, and `graphify-out/*.json`.
- **The green is the false clean:** `node --test .claude/lib/superpowers-parallel/tests/workflow-sandbox.test.mjs` -> tests 78 / pass 78 / fail 0, while E6 is open. The suite asserts the one closed route (`[].constructor.constructor` at test `:166,:174-176`) and none of the nine open bare-identifier routes.
- **Not run:** the full 1690-test suite (only the 78-test sandbox file); the "mitosis.js uses `undefined` 63 times" census (taken as reported).

**Deployment integrity — confirmed.** `installed_plugins.json` records `session-continuity@continuity-ledger` at `gitCommitSha 0fe1c02`, `installPath …/cache/continuity-ledger/session-continuity/0.1.0`. `git cat-file -p 0fe1c02:hooks/lib/installer.mjs | grep -c isManagedHooksDir` -> 0; the deployed cache `installer.mjs` -> 2. The deployed enforcement file is a hand-patch: it carries a guard absent from the SHA it is recorded at. The deployed cache is still the old single-file installer, not the round-3 split.

**Runtime-independence verdict: independent as code, coupled by one shared gate.** Neither repo imports the other (grep for `continuity-ledger` / `superpowers-parallel/workflow-sandbox` across both hook trees returns nothing). `workflow-sandbox.mjs` imports only `node:vm`. The only coupling is that the continuity plugin (Track A) manages `.windful-ocean`'s `core.hooksPath` (`git config --show-origin core.hooksPath` -> `…/session-continuity-inline/…/githooks`, `priorHooksPath = .githooks`). So Track A is the pre-commit gate that runs Track B's `npm test`. That is a build/CI-time coupling of the enforcement artifact, not a runtime interaction of the two modules. The regression is intra-track as the record states; but both tracks are enforced by one mechanism, which is why the shared-method invariants are load-bearing.

## 1. Track A invariants

**A1 — Managed-dir identity is decided only by structural identity (realpath equality, plugin-owned path shape, or a sentinel whose declared realpath equals the dir's realpath), never by the content of any hook file or the text of any config value.**

- Failure class: false-positive reclassification of a user's own dir as managed, so capture is declined or config overwritten (E1, E2).
- Oracle: CLOSED. Static half: the identity module's only filesystem read is `MANAGED_SENTINEL_FILE`; any `readFile`/`includes`/`indexOf`/substring test against a hook body or a config value halts the oracle. Dynamic half: a differential corpus of dirs that (a) contain a `pre-commit` mentioning `continuity.priorHooksPath` but are structurally unowned, and (b) are genuinely owned — `isManagedHooksDirIdentity` must return false for every (a) and true for every (b). Closed because the static rule rejects any read outside the sentinel.
- Falsifier: a dir with `pre-commit` containing the string `continuity.priorHooksPath`, not under the plugin data root. On `942d5f8` `isManagedHooksDir` returns true (lines 89-90); at HEAD it returns false.

**A2 — Prior-hooks value is read across every scope the dispatcher can read, is classified by scope, and multiplicity is counted within the effective scope only.**

- Failure class: healthy configs declared corrupt and destroyed by cross-scope counting (E4); a heal blind to the scope the value lives in (E1 "--local only").
- Oracle: CLOSED on the read shape (must be `--get-all --show-origin`, count filtered by `origin === effective.origin`); OPEN on the scope taxonomy (the enumerated set worktree/local/inherited), deliberately left open. An enumeration miss cannot produce this invariant's failure class: counting is per-origin and therefore closed, and writes are restricted to `WRITABLE_SCOPE_FLAG` local/worktree (`git-config-scope.mjs:8`), so an unrecognized origin can never receive a destructive write. Add one row asserting the classification agrees with git's own `--show-scope` token (flag verified on git 2.55.0). A `--local`-only effective read, or a count over all pairs, fails the static check.
- Falsifier: one good value in `--local` plus one unrelated value in `--global`. Pre-fix reports count 2 and declares corrupt; at HEAD reports count 1, scope local (`prior-hooks-path.mjs:95`).

**A3 — No heal or capture leaves `core.hooksPath`/`priorHooksPath` self-referencing the managed dir or pointing inside the work tree, nor silently discards a recoverable prior; every declined, unrecoverable or failed outcome is written to a diagnostic key and emitted to stderr.**

- Failure class: silent gate death; a relative inherited path becoming an exec target inside the work tree; a declined capture permanently dropping the gate (E1, E2, disclosed residual).
- Oracle: CLOSED throughout. Self-reference gate (`isManagedHooksDirIdentity`) and work-tree gate (`isInsideWorkTree`, `prior-hooks-path.mjs:143`) are closed by construction. Report coverage is closed by a census derived from the exported outcome enums (`prior-hooks-path.mjs:29,37`): every member is classified either reported (its line asserted) or silent-by-design, and an unclassified member HALTS. This closure is required, not optional — an enumeration miss produces exactly this invariant's failure class, since a new enum member falls through to `return null` (`session-start.mjs:43,47-48`) and the outcome goes silent.
- Residual after closing: an outcome minted outside the enum constants. Closed by a static rule that outcomes may only be enum references.
- Falsifier: an inherited relative `core.hooksPath` resolving inside the work tree -> `recoverFromInheritedHooksPath` returns `{recovered:false}`; a declined capture writes `DECLINED_PRIOR_HOOKS_PATH_KEY` and `captureReportLine` emits.

**A4 — A config write whose failure changes correctness is inspected and surfaced; a heal that cannot rewrite reports failed and preserves the corrupt record.**

- Failure class: E1 "failed writes swallowed with no signal".
- Oracle: CLOSED. A call-site census derived by static scan, not an enumeration: every `writeLocal` and every mutating `repoExec(['config'…])` site must either read `code` or carry an explicit best-effort annotation, and an unannotated site HALTS. Git spawns outside `repoExec` (`git-config-scope.mjs:10`, the sole primitive) are banned so the scan's domain is total. Closure is required — an N+1th unchecked correctness-bearing write is precisely this failure class. Today `prior-hooks-path.mjs:196,:244` are unchecked and must be classified explicitly.
- Falsifier: force the `priorHooksPath` write to return non-zero -> outcome failed (`prior-hooks-path.mjs:198`) and `healReportLine` emits the failed line (`session-start.mjs:30-33`).

**A5 — The dispatcher execs the prior hook for every hook name unconditionally, and its gating-warn classification is a total classification over the full hook-name universe of the running git, in which no name defaults to non-gating.**

- Failure class: E3 — a gating hook silenced; a refusing prior's refusal lost, caused by a name missing from an enumeration.
- Oracle: CLOSED (census with halt, the ledger-0130 shape). (a) Universe derivation, mechanical: parse the `.SS` hook-name headers from the installed githooks(5) page (`/opt/homebrew/share/man/man5/githooks.5`; 28 names; `.TH` stamp `Git 2.55.0` must equal `git --version`, both verified live); cross-validate each name against the running binary via `git hook run` in a throwaway hook-less repo (a non-member exits 1 with `unknown hook event`, verified live). Zero parsed names, a version-stamp mismatch, or a binary-rejected name HALTS. (b) Total classification: a committed table maps every derived name to exactly one of chained-gating, chained-non-gating, chained-state-dependent(states), not-chained; the census requires set equality between table keys and the derived universe, so a new hook name in a future git has no row and HALTS red rather than defaulting. Cross-checks: the table's non-gating and state-dependent projection must equal exactly the dispatcher's case arms (`hooks/dispatcher:11-15` — `post-index-change`, `reference-transaction`/`prepared`), and its chained projection must equal `CHAINABLE_HOOKS` (`hooks/lib/hook-names.mjs`, 18 names; 28 minus 18 equals 10 not-chained). Drift halts. (c) Fail-safe direction: `continuity_gating_hook` returns gating for any name outside its case arms (verified at HEAD), and a test invokes the dispatcher under a fabricated name and requires the warn.
- Falsifier: delete the `reference-transaction` row from the table, or add a 29th `.SS` name to a fixture page — the census must go red, which is E3's exact shape (omission). Plus the existing refusing-prior fixture (`reference-transaction-gate.test.mjs:70,84,100`).
- Residual, stated: the content of each row is transcribed from man-page prose by a human, so a wrong verdict on an enumerated name (misclassification, not omission) is not machine-derived — no machine-readable gating-semantics source exists in git's installed artifacts (verified: `git hook` validates names but neither enumerates nor describes them). Bounded by per-row fixtures for chained hooks where drivable, and by the fail-safe default. The omission class, the one that produced E3, is closed.

**A6 — The deployed enforcement artifact equals a versioned build of committed source at the recorded install SHA; no hand-patch, and any plugin refresh reproduces the guard.**

- Failure class: a manager refresh silently reverting the guard to a false-clean gate (ledger 0132).
- Oracle: CLOSED. Compare the deployed `installer.mjs` and its split modules byte-for-byte, or by content hash, against the build output of `installed_plugins.json.gitCommitSha`; any divergence halts with a loud session-start warning.
- Falsifier: today, deployed `installer.mjs` has the guard (grep 2) while `0fe1c02` does not (grep 0), so the oracle is red now.

## 2. Track B invariants

**B1 — The sandbox realm's backing global is a fresh vm realm global (`DONT_CONTEXTIFY`), never a host-realm object; no identifier resolvable in the workflow body reaches a host-realm intrinsic or host prototype chain.**

- Failure class: E6 — `constructor.constructor` host escape; nine bare identifiers bridging to host.
- Oracle: CLOSED. Static: `createContext` must be called with `vm.constants.DONT_CONTEXTIFY`, never `{}`. Dynamic census: enumerate every own-property name of the host `globalThis`, host `Object.prototype`, and host `Function.prototype`; for each, the sandbox must either deny (tagged) or resolve to a value whose realm identity is the sandbox, not the host. A host-realm identity halts red. Anchored probe: `constructor.constructor("return process.cwd()")()` must throw.
- Falsifier: that probe returns the host cwd on `createContext({})` (reproduced) and throws `process is not defined` under `DONT_CONTEXTIFY` (reproduced).

**B2 — Every denial is observable as a tagged `SandboxViolationError`; no sandbox mechanism (proxy invariant, `ownKeys` filter, freeze/seal) raises an untagged host error a workflow could catch as its own.**

- Failure class: the `Object.freeze(Math)` untagged proxy-invariant `TypeError`.
- Oracle: CLOSED. The operation universe is machine-derived as the 13 proxy traps, taken as `Reflect`'s string-keyed methods (verified live on node 26.4.0), not enumerated by hand — freeze was precisely the unenumerated operation that escaped. One row per trap per guarded and denied binding, plus a handler census: an implemented trap with no row HALTS. Every thrown error must carry `SANDBOX_VIOLATION`.
- Falsifier: `Object.freeze(Math)` throws untagged `TypeError: 'ownKeys' on proxy: trap result did not include 'random'` today (reproduced).

**B3 — A guarded intrinsic denies exactly its enumerated members and does not raise a sandbox violation on any non-denied member.**

- Failure class: over-denial regression — guarded set/delete rejects every member (`Math.ceil` reproduced).
- Oracle: CLOSED complement census per guarded intrinsic — the non-denied set is `Reflect.ownKeys(intrinsic)` minus the denied members, and every member of it is asserted, not a sample of three; over-denial of an unsampled member is exactly what a sample misses. The assertion is "raises no TAGGED violation" on get/set/delete/defineProperty, never "does not throw": Math's eight non-writable constants (verified live) legitimately throw ordinary language TypeErrors, and asserting no-throw would manufacture a false red.
- Falsifier: `Math.ceil = 1` throws `[Math.ceil]` today; the invariant requires it not to be a sandbox denial.

**B4 — Every named policy constant (`VALUE_GLOBALS`, `ALWAYS_DENIED`, `ALLOWED_GLOBALS`) is load-bearing: emptying it turns at least one assertion red.**

- Failure class: inert constants manufacture a false clean.
- Oracle: CLOSED mutation oracle — for each constant, an in-test mutation that empties it must flip a verdict. The pruning must be re-expressed so the constant actually drives behavior (retained set defined by `VALUE_GLOBALS`; prune list defined by `ALWAYS_DENIED`), not merely filters a set that already excludes it.
- Falsifier: emptying `VALUE_GLOBALS` today leaves the suite green (value globals are non-configurable and survive regardless); emptying `ALWAYS_DENIED` today leaves it green (no member is in the filtered sets).

**B5 — The test census of routes into the host is closed: every host-reachable bare identifier and every free identifier the engine source uses in the workflow-body position has an assertion row classifying it allow/deny/value; an unclassified identifier halts.**

- Failure class: E5/E6 — the suite asserts the one closed route and none of the open ones.
- Oracle: CLOSED census (the ledger-0130 pattern): mask strings and comments, enumerate the identifier set, require a row per member, halt on anything unclassifiable. Chosen over a sampled matrix because a sampled matrix is exactly what hid the nine routes.
- Falsifier: the nine bare identifiers have zero assertion rows today.

**B6 — The harness has at least one real production caller and its liveness is proven by that caller, not by self-referential lint artifacts.**

- Failure class: a harness that certifies nothing (the entire purpose of Step 1, ledger 0133) passing a vacuous lint.
- Oracle: CLOSED. The dead-export lint's reference count must be computed over string- and comment-masked source (so a symbol referenced only inside its own error messages counts zero) and its liveness glob must include `tests/`; and the engine reconstruction path that today uses `new AsyncFunction` (per 0126, `frontier-train-e2e.test.mjs:24-26`) must route through `compileWorkflow`.
- Falsifier: masking strings drops `compileWorkflow`'s caller count from 2 (its `:181`/`:184` messages) to 0, so the lint is red until a real caller exists.

## 3. Shared method invariants

These are the properties both tracks violated round after round; no per-track invariant captures them.

**M1 — Whole-invariant-set check per step, recorded in a committed coverage artifact.** Every change is verified against the full invariant set of its track and the verdict recorded IN THE REPO, not in the PR body. The PR body cannot carry it: `pr-create`'s flag set is closed (`mitosis-git.mjs:34-39`, unknown flags rejected at `:98-100`), values are capped at 200 characters (`pr-format.mjs:4`), the tool alone renders the body (`:281`; `pull-requests.md:46`), and post-creation body edits are denied (`pull-requests.md:3`). All confirmed against the live tree.

- Oracle: CLOSED for presence and totality. Each repo commits an invariant registry (its track's IDs plus M1-M6), and each PR must add or update a coverage entry whose rows are set-equal to the registry — every ID marked threatened or not-threatened with the check named; a missing or unknown ID fails. Every PR requires an entry; no guarded-path glob decides applicability, since that would itself be the enumerated allowlist M2 forbids.
- Falsifier: a PR whose diff omits the entry, or whose entry lacks one registry ID, goes red in CI.
- Enforcement and cost: a roughly 50-line check script plus one step in each repo's existing PR-triggered workflow. Both workflows exist and were verified — Track A `continuity-ledger-plugin/.github/workflows/receipts.yml` triggers `on: pull_request` with `fetch-depth: 0`; Track B `.windful-ocean/.github/workflows/test.yml` triggers on push and pull_request (Track B has no receipts workflow, only labeler, security and test). Merge is already human-gated, so a required red check is binding. Cost is one registry file and script per repo (twins of one mechanism, no shared runtime) plus roughly twelve rows of per-PR friction, which is the point. Verdict for Track A: works, same mechanism, its own workflow, committed in its own tree.
- Residual: CI proves the coverage table exists and is total, not that a "not threatened" verdict is TRUE. That half remains a human gate by nature. Direct remedy for the N+1th-path failure (0134).

**M2 — Closed census over enumerated allowlist.** Any gate that classifies tokens, identifiers or paths is a closed census that halts on the unclassifiable; a pinned count or a sampled allowlist is forbidden as a change-detector (generalizing 0130 and 0127). Oracle: for each gate, an "unclassifiable input halts" test, and a ban on assertions of the form `count === N`. Track A's round-1 substring probe and Track B's sampled route matrix both violated this.

**M3 — Red-before-green receipt with an inertness mutation.** Every fix ships an acceptance test that is red on the parent commit and green on the fix, asserting the reported symptom, plus a mutation (empty the constant, remove the guard, swap `DONT_CONTEXTIFY` back to `{}`) that must turn the assertion red. Oracle: run the new test against `HEAD~1` (must fail) and `HEAD` (must pass); run the mutation (must fail). All six escapes shipped green suites; this is the highest-value method invariant.

**M4 — Refactor and behavior change are separated.** A structural refactor and a behavior change do not share one reviewable range unless a characterization test pinning the surviving behavior is written before the refactor. Oracle: for a mixed range, a diff partition plus a behavior-equivalence suite against the pre-refactor commit. Track A round 3 (426 -> 135 plus probe deletion in one range) is exactly the shape the record blames for hiding two escapes.

**M5 — Citations re-derived at cite time.** Every `path:line` in a plan, spec or PR is re-derived against the live tree when written, never copied (0128). Oracle: a mechanical anchor-check grepping each cited construct against the current file.

**M6 — Enforcement-artifact integrity.** The artifact that enforces a gate is a versioned build of committed source at its recorded SHA; a hand-patched deployed file is forbidden, and a refresh must reproduce the guard. Oracle: deployed-artifact hash versus build-from-recorded-SHA; mismatch halts loudly.

## 4. Escape traceability matrix

| Escape | Invariants | Oracle that catches it | Where the oracle first exists | Red-on-pre-fix evidence |
|---|---|---|---|---|
| E1 (A, r1: content-substring probe overwrote config) | A1, A2, A3, A4 | A1 closed static "no read outside sentinel" plus differential fixture (user pre-commit mentioning the key must be false) | Track A Step A-2 (invariant harness); root already fixed at HEAD | Traced, not run: at `942d5f8` lines 89-90 the probe returns managed true on the fixture; at HEAD it returns false. |
| E2 (A, r2: `looksLikeManagedHooksDir` content probe gating capture) | A1, A3 | Same A1 differential, applied to the capture path (`capturePriorHooksPath`) | Track A Step A-2 | Traced: same `942d5f8` probe, reached via the capture decline path. |
| E3 (A, r2: `reference-transaction` silenced) | A5 | Refusing-prior `reference-transaction` fixture: gate holds when prior runs, skip reported when it cannot; plus the A5 closed census — man-page-derived name universe, total classification, halt on the unclassified | Fixture already present: `reference-transaction-gate.test.mjs:70,84,100`; census in Step A-2 | Traced: `fde6f46^` dispatcher classifies `reference-transaction` non-gating, so the self-reference/dangling early-exit warns silently. |
| E4 (A, r2: cross-scope multiplicity destroyed good config) | A2 | Multi-scope fixture asserting count within effective origin and scope label | Track A Step A-2; fix present at `prior-hooks-path.mjs:95` | Traced: pre-fix counted across all pairs, count 2, declared corrupt. |
| E5 (B, r1: value globals shadowed, `x === undefined` false) | B1, B4, B5 | `unbound` helper (identity, not shadow) plus value-globals-keep-production-semantics rows plus census | Present: test `:16-21,:78-93`; census added in Step B-1 | Not run against r1; the `void 0 === undefined` row is the catching assertion. |
| E6 (B, r2: `createContext({})` host bridge) | B1, B2, B5 | B1 host-reachability census (`constructor.constructor` probe plus nine bare rows) plus B2 tagged-error corpus | New: nine probe rows and `DONT_CONTEXTIFY` in Step B-1/B-2 | Executed both directions: reproduced host cwd on `{}`; `process is not defined` under `DONT_CONTEXTIFY`. |

Every row maps to a mechanical oracle. E1-E4 "red on pre-fix" is grounded in reading the historical source, not executing it; the executable proof is deferred to the differential-corpus step, which runs each fixture against the pre-fix commit. E6 is the only row proved red-and-green by execution.

## 5. The plan

**Cross-track ordering.** The two tracks share no code and can proceed in parallel, with three serialization points: (1) the method gates M1-M6 are adopted before any track work, because they are the thing that failed; (2) within each track, oracles precede fixes (M3); (3) the Track A deployment-integrity reconcile (A6/M6) runs after Track A lands, because it regenerates the cache from the landed SHA. Track A and Track B waves 1-3 run concurrently.

### Wave 0 — Method gates (serial, both tracks, no code)

- Change: adopt M1-M6 as the review contract — a committed invariant registry plus a per-PR coverage entry in each repo, enforced by a CI census step in Track A's `receipts.yml` and Track B's `test.yml`; a red-before-green receipt with an inertness mutation required per fix; a strings-masked citation/anchor check; and the M6 artifact-integrity check.
- Invariant verdicts: none of A1-A6 or B1-B6 are threatened; this only adds gates.
- Check: the two PRs below cannot MERGE without a green coverage census. `pr-create` cannot carry a table, so enforcement is CI plus the human merge gate, never the PR body.
- Exit: registry, check script, and CI step committed in both repos.

### Track A

**Step A-1 — Round-3 review as a differential-corpus run (this is the missing review).**

- Change: no source change first. Build the A1-A5 differential corpus and run it against HEAD (`5bc19a4`) and against `942d5f8`/`fde6f46^`.
- Threatened-invariant verdict (full set): A1 not threatened (read-only). A2 not threatened. A3 not threatened. A4 not threatened. A5 not threatened. A6 not threatened. The step only observes.
- Check: every fixture must be red on the pre-fix commit and green on HEAD (M3); any HEAD red is a real round-3 regression and becomes a fix in A-2.
- Exit: corpus green on HEAD, red on pre-fix, for all of E1-E4 plus the E3 gate fixture.

**Step A-2 — Fix only what A-1 turned red on HEAD (expected: none), plus fold the disclosed residual.**

- Change: if A-1 is fully green, the only change is an oracle row asserting the `<dataRoot>/<dashed-name>/githooks` residual is declined-and-reported, never silent. If A-1 found a red, fix it under M4 (refactor already landed, so the fix is behavior-only in the identity/heal module, pinned by a characterization test). Plus the closed oracles the GAP-3 sweep requires: the A5 hook-name census artifact (man-page derivation, total classification table, dispatcher and `CHAINABLE_HOOKS` cross-checks, fabricated-name warn test), the A3 enum-derived report census, the A4 write-call-site census, and the A2 `--show-scope` agreement row.
- Threatened-invariant verdict: A1 threatened only if the residual row also touches identity — verdict: the row is assertion-only, A1 not threatened. A3 threatened (it owns "declined outcomes are reported") — verdict: the row strengthens A3, checked by asserting the declined key and stderr line. A2, A4, A5, A6 not threatened (untouched code paths).
- Check: full A-1 corpus re-run green; residual row red if the declined line is removed (M3 mutation).
- Exit: A1-A5 green with A3, A4 and A5 oracles CLOSED, residual explicitly asserted as reported.

**Step A-3 — Land Track A and close deployment integrity (serial, after A-2).**

- Change: merge `fix/hooks-prior-path-self-heal` (human-gated). Then close A6: cut a plugin version that contains the landed guard, update `installed_plugins.json.gitCommitSha` to the landed commit, and let the plugin manager install it through its normal update flow. Add the M6 artifact-integrity check to session start. Never hand-patch the cache again (0132).
- Threatened-invariant verdict: A6 is the subject — verdict: satisfied only when the deployed hash equals the build of the recorded SHA. A1-A5 not threatened (no source change at merge).
- Check: post-refresh, deployed `installer.mjs` plus split modules hash-match the landed SHA's build; the M6 check is green; a manual re-run of the A-1 corpus against the deployed cache is green.
- Exit: no hand-patched artifact remains; a refresh cannot revert the guard.

### Track B

**Step B-1 — Add the closed census and the failing oracles first (red on current code).**

- Change: add the B1 host-reachability census (nine bare-identifier rows plus the `constructor.constructor` host probe), the B2 corpus derived from the 13 `Reflect`-derived proxy traps with a handler census, the B3 complement census (`Reflect.ownKeys` minus denied, asserting no TAGGED violation rather than no throw), the B4 empty-the-constant mutations, and the B5 identifier census. No production change yet.
- Threatened-invariant verdict (full set): B1 through B6 all exercised, not threatened — these are tests; they must go red now (E6, freeze, over-denial, inert constants) and that red is the deliverable of this step.
- Check: the new rows fail on `e40a292` exactly where section 0 reproduced them.
- Exit: the suite is red, and each red names an open route.

**Step B-2 — Apply the production fixes the red oracles demand.**

Change, each checked against all of B1-B6:

- `createContext(vm.constants.DONT_CONTEXTIFY)` (`workflow-sandbox.mjs:114`). Threatens B1 (fixes it), B5 (census must stay green), B2 (must not introduce untagged errors), B4 (retained-set logic must still bind value globals — under `DONT_CONTEXTIFY` the realm global is fresh, so the installer's prune runs over a real realm global; re-verify value globals survive). Verdicts: B1 fixed; B2, B3, B5, B6 not threatened by this line; B4 re-checked by the value-globals rows.
- Tag the freeze/`ownKeys` path so any proxy-invariant failure surfaces as `SandboxViolationError` (B2). Threatens B3 (the `ownKeys` filter interacts with set/delete) — verdict: checked by the B3 rows; B1 and B5 not threatened.
- Scope guarded set/delete/defineProperty to denied members only (B3). Threatens B2 (must still tag denied-member writes) — verdict: checked by the B2 corpus; B1 not threatened.
- Make `VALUE_GLOBALS` and `ALWAYS_DENIED` load-bearing (B4): retained set derived from `VALUE_GLOBALS`, prune list derived from `ALWAYS_DENIED`. Threatens B1 (pruning correctness) and B5 (census) — verdict: both re-run.

Check: the full B1-B6 suite green; each B4 mutation red (M3); the E6 probe from section 0 re-run by hand throws.
Exit: every route in the census is closed or tagged; no constant is inert.

**Step B-3 — Make the harness non-vacuous, then land (serial, after B-2).**

- Change: fix `dead-export-lint.test.mjs` to mask strings and comments before counting and to include `tests/` in liveness; wire the engine reconstruction that today uses `new AsyncFunction` (per 0126) through `compileWorkflow` so the harness gates real engine behavior (B6). Merge `feat/workflow-sandbox-harness` (human-gated).
- Threatened-invariant verdict: B6 is the subject. B1-B5 not threatened by the lint change; wiring the real caller re-runs the whole suite against actual mitosis.js sources, which is the intended B5 census check at full scope.
- Check: masked lint reports `compileWorkflow` dead until the real caller exists, then green; the real engine path compiles under the sandbox with the census green.
- Exit: the harness has a real caller and its liveness is not an artifact of its own strings.

**Parallelism.** Track A (A-1 to A-3) and Track B (B-1 to B-3) run concurrently — different repos, no shared code. Within each track the steps serialize (oracle, then fix, then land, per M3). A-3's integrity reconcile serializes after A-3's merge.

## 6. Verification and landing

**Track A round-3 (refactor plus behavior in one range).** Verified by M4: the A-1 differential corpus is the characterization suite the refactor lacked. It runs against `942d5f8`/`fde6f46^` (must be red on the four escape classes) and HEAD (must be green), which proves the behavior delta is exactly the intended probe removal and per-scope counting, not an incidental change smuggled by the split. Additionally, a structural-equivalence check that the surviving behaviors (the `STANDARD_HOOKS`/`CHAINABLE_HOOKS` sets, the capture/heal outcome enums, uninstall restoration) are unchanged across the split closes the "large refactor hid an escape" risk. The round-3 review is therefore this corpus run, not a fresh manual pass.

**Track B vacuity.** The harness stops certifying nothing by (a) routing the engine reconstruction through `compileWorkflow` so a real production surface is compiled under production sandbox rules, and (b) fixing the dead-export lint to mask string literals and to count `tests/`, so a symbol kept alive only by its own error messages reads dead. Until (a) lands, (b) keeps the branch honestly red.

**Deployment integrity.** Closed by A6/M6: land the guard into a released plugin version, update the recorded SHA in `installed_plugins.json`, install through the manager's normal flow, and add a session-start check that compares the deployed artifact to the build of its recorded SHA and halts loudly on mismatch. This removes the hand-patch and makes a silent revert detectable. The exact release mechanism is the plugin's own publish process and was not verified read-only.

**Merge/PR sequence.** Track A: one human-gated PR for `fix/hooks-prior-path-self-heal` (it already carries `2e91b33`, so landing it supersedes the hand-patch in source), then the version/cache reconcile. Track B: one human-gated PR for `feat/workflow-sandbox-harness` carrying `DONT_CONTEXTIFY`, the census, the tagged-error and member-scoping fixes, the load-bearing constants, and the real caller. No cross-track merge dependency.

## 7. Residuals, risks, and what this plan does not cover

Ordered by severity.

1. **Track A A6 window (medium).** Until the released version is installed, the live gate remains a hand-patch that a refresh reverts. The M6 session-start check detects the revert but does not prevent the refresh; the durable fix is the version bump, whose release step was not executed.
2. **Track A disclosed residual (low).** A user's real external hooks physically at `<dataRoot>/<dashed-name>/githooks` are still declined (the projectKey/`isProjectKey` collision at `managed-hooks-identity.mjs:67`). Accepted because the trigger is narrow (external hooks living under the plugin's own data root, dashed parent, named exactly `githooks`) and it is now recorded at `continuity.priorHooksPathDeclined` and reported, not silent. A closed fix would require a stronger owned-path proof than a dashed-segment shape.
3. **M1 verdict truthfulness (medium).** The CI census proves the coverage table exists and is total, not that a "not threatened" verdict is true. That judgment remains the human review gate.
4. **A5 row content (low).** Gating semantics per hook name are human-transcribed from githooks(5) prose. Omission is closed by the census; misclassification is bounded by per-row fixtures and by the dispatcher's default-gating direction.
5. **Track B realm-local bare intrinsics (low).** Under `DONT_CONTEXTIFY`, bare `toString`/`valueOf` and friends still resolve to the sandbox realm's own `Object.prototype` members. This is harmless (realm-local, no host bridge); the B5 census must assert each is realm-local rather than expecting `undefined`, or it will manufacture a new false red.
6. **Unverified-by-execution claims (disclosure, not a defect).** The 692-test Track A suite, the full 1690-test Track B suite (only the 78-test sandbox file was run), and the E1-E4 differential fixtures against the historical commits were not run; those are traced from source. The mitosis.js "63 uses of undefined" census is taken as reported.

**Out of scope (named):** the twelve leaked worktrees and the Step 0 reaper; Step 1.5; Step 3 durable-state journal; the two parked stashes belonging to another branch (untouched); and any change to `mitosis.js` beyond wiring it through the harness.
