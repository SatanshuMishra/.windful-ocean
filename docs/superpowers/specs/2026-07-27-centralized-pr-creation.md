# Centralized pull-request creation

Status: approved
Date: 2026-07-27 (revised the same day after three independent adversarial reviews)
Owner units: CORE-TOOL, ENGINE, GATE, RULES-CI
Landing order: CORE-TOOL first. ENGINE and GATE depend on it (section 11).

## 0. Revision record

Every CRITICAL, HIGH and MEDIUM finding from the security, integration and correctness reviews, with its disposition. Findings that recommended CUTTING something were treated as first class; four cuts were taken.

| # | Finding | Disposition |
|---|---|---|
| R1 | Body structure is forgeable by caller values; the "one single-line construct" claim is false | ACCEPTED. Sanitizer step 8 replaced by a tag-opener + leading-block-opener + setext rejection (section 8); unforgeability paragraph rewritten; the pinned test now exercises a BARE-rendered field |
| R2 | The gate is line-oriented, so a backslash continuation passes it | ACCEPTED, reproduced against the live hook. Fixed by folding the match subject once, in the extractor (section 9.1). The reviewer's `sed` implementation is REJECTED as incorrect on this platform - see R2a |
| R2a | Reviewer's proposed `sed -e ':a' -e 'N' -e '$!ba' ...` fold | REJECTED AS WRONG. Verified on Darwin (BSD sed): that slurp idiom emits NOTHING for single-line input, so the match subject would be empty for every ordinary one-line command and the ENTIRE hook would fail OPEN. The fold moves into the existing python3 extractor instead |
| R3 | Nothing gates post-creation mutation (`gh pr edit`, `PATCH .../pulls/N`) | ACCEPTED, reproduced. New deny branches plus MCP `update_pull_request` denies (sections 9.1, 9.3) |
| R4 | Merge stays reachable through GraphQL while section 1 claimed merge is impossible | ACCEPTED, reproduced. GraphQL merge mutations route to the EXISTING merge deny reason; MCP `merge_pull_request` denied; the section 1 claim is amended to the truth |
| R5 | Path-qualified `gh` slips the left boundary | ACCEPTED, reproduced. Optional path prefix added to all `gh` patterns, including the pre-existing merge rule |
| R6 | GraphQL branch only fires on a literal inline mutation name | ACCEPTED. An opaque-payload branch denies `gh api graphql` whose query comes from a file or `--input` |
| R7 | The decompose boundary is weaker than the boundary that rejects | ACCEPTED, merged with R14. Schema patterns become printable-ASCII; decompose acceptance validates composed titles AND a rationale value predicate |
| R8 | Section 13 overstates coverage of P3 | ACCEPTED. Corrected; P3's printed-URL fallback is named as residual 9 |
| R9 | `pullsep` does not match a trailing slash | ACCEPTED, reproduced, closed |
| R10 | `--verified` is mandatory but has no source at any engine call site | ACCEPTED. Resolved structurally: the engine composes an explicit `--not-verified` literal, because at PR-open time no CI has run (verified: `mitosis.js:4599` opens the PR, `:4600` waits for CI) |
| R11 | `--provenance` needs a model the engine does not set at 2 of 3 sites | ACCEPTED. Verified: `:4603` sets `model: 'opus'`, `:3010` and `:4074` set none. The engine emits the literal the site sets, or `unspecified`. Mutating the two dispatch options is REJECTED - that changes runtime model routing, which is outside this spec |
| R12 | Supersede site emits one `--what` and would fail a 2-value minimum | DISSOLVED by the R21 cut (`--what` is now 1..5) and by writing the supersede invocation out in full |
| R13 | `prTitleFor(mspId)` must become `prTitleFor(msp)` at all 3 call sites | ACCEPTED, named explicitly in section 11 |
| R14 | Non-ASCII fails at ship time on the most likely input | ACCEPTED. Schema patterns and `PR_TITLE_PATTERN` are printable-ASCII, so the failure lands at decomposition where `NeedsHuman` exists |
| R15 | The ship site cannot honestly emit any CI verification, and worked example A invited it | ACCEPTED. Worked example A is now the machine path with NO `Verified:` line; example B carries the legitimate one |
| R16 | Supersede title overflow is validated at the wrong point | ACCEPTED. MSP id is capped in the schema and BOTH composed titles are validated at decompose acceptance |
| R17 | Manifest reuse validates presence, not composability | ACCEPTED. Reuse composes both titles and applies the value predicate |
| R18 | Sections 5 and 7 contradicted each other on whether `--verified` is required | ACCEPTED, section 5 corrected |
| R19 | Section 12 undercounts the test edits | ACCEPTED, enumerated - but the proposed closure condition "no test file contains `mitosis: `" is REJECTED AS WRONG: `mitosis-scheduler.test.mjs:2665,:2798,:2820` legitimately embed `mitosis: FORGED all-clear` as newline-injection fixtures for LOG forging, unrelated to PR titles. The condition is narrowed to `--title` fixtures |
| R20 | `gh-scope-lint` requires the wrapper invocation and the exit-21 wording on ONE source line | ACCEPTED, verified at `gh-scope-lint.test.mjs:93-111`, stated in section 11 |
| R21 | A `--what` minimum of 2 manufactures a bullet | ACCEPTED (CUT). `--what` is 1..5 |
| R22 | The 12000-character body cap has no enforcement point | ACCEPTED (CUT). The cap is DELETED: per-value caps and cardinalities already bound the body by construction, and an existing test pins that bound against GitHub's real 65536 limit |
| R23 | Cross-unit test dependency contradicts "four units run concurrently" | ACCEPTED. A hard landing order is stated; file ownership remains disjoint |
| R24 | The receipts lint never re-runs on a title edit | ACCEPTED, verified at `receipts.yml:2-3` (`on: pull_request:` with no `types`). Trigger widened, heavy job guarded |
| R25 | The field set is restated in four places with no drift guard | ACCEPTED. The deny reason shrinks to a skeleton plus a pointer, `commands/pr.md` becomes a pointer, and one test pins the reason against `FLAG_SPEC` |
| R26 | `--origin` is caller-asserted; always require `--provenance` | PARTIALLY ACCEPTED. The caller-asserted nature of `--origin` is now stated plainly. Requiring `--provenance` on the human path is REJECTED: a human-directed caller may not know its own model string, and compelling a value the caller cannot know is precisely what the honesty rule forbids (Quality over uniformity) |
| R27 | `--review-order` is the least load-bearing field | ACCEPTED (CUT). Removed entirely: its trigger is invisible to the tool and it cost a flag, a cap, a cardinality, a render rule and a test |
| R28 | Two byte-for-byte golden-body tests are change-detector shaped | ACCEPTED (CUT). One golden body remains |
| R29 | Four value caps and five cardinality ceilings, none derived | ACCEPTED. Collapsed to ONE value cap (200) plus the load-bearing title cap (72) |
| R30 | `--changed-lines` source does not exist | ACCEPTED. Verified: `runCompare` (`mitosis-git.mjs:421-446`) emits only `{ahead_by, status}` and `ahead_by` is a COMMIT count. The false claim is deleted and a local, no-network source is specified |
| R31 | Cited anchors drift by a few lines | ACCEPTED. Every anchor in this spec was re-read against the WORKING TREE (not HEAD) and corrected; the corrections are listed in section 11. See the anchor-freshness warning below - anchors in `mitosis.js` and `settings.json` are live |

**Anchor freshness warning.** Every `path:line` in this spec was verified by reading the working tree on 2026-07-27, not `HEAD`. Two owned files already carry UNCOMMITTED changes from a different line of work at revision time:

- `.claude/workflows/mitosis.js` (ENGINE) - a reconcile-stage manifest-paging change adding `manifestRawPages` to `RECONCILE_SCHEMA` around `:1285` and rewriting the reconcile prompt around `:3597-3600`, plus a stray `mitosis.js.bak-49b8b89c` sitting beside it.
- `.claude/settings.json` (GATE) - the `permissions.ask` block at `:75-78` that converts the `lib/**` and `workflows/**` Edit denies to ASK.

Every anchor cited here already accounts for both. But ENGINE and GATE must re-confirm their anchors immediately before editing, and must not revert or fold the concurrent work: it belongs to another effort. The insertion at `:1285` is AFTER `DECOMPOSE_SCHEMA` (`:1254-1276`), so section 4's anchors are unaffected by it.

## 1. Problem and invariant

Five independent paths can open a pull request in this environment and four of them invent the title and body ad hoc: the mitosis engine (P1), the vendored `/commit-push-pr` command (P2), the vendored superpowers finishing-a-development-branch skill (P3), the GitHub MCP `create_pull_request` tool (P4), and ad-hoc `gh pr create` / `gh api` POSTs (P5).

Invariant this spec establishes:

> Every pull request opened from this environment, from any origin, is created by one tool, in one format, and neither its title nor its body may be rewritten afterwards through the Bash tool or the GitHub MCP tool.

Three parts, deliberately minimal:

- **ONE TOOL** - the existing `pr-create` verb in `.claude/lib/superpowers-parallel/mitosis-git.mjs`, generalized **in place**, owns title grammar and body assembly.
- **ONE GATE** - `.claude/hooks/block-destructive-bash.sh` denies raw PR creation AND raw post-creation title/body mutation at the point of execution (origin-agnostic, so it covers the vendored P2/P3 without editing vendored code), backed by `permissions.deny` in `.claude/settings.json` for both Bash and the GitHub MCP tool.
- **ONE RULE** - `.claude/rules/common/git/pull-requests.md` becomes a short pointer at the tool; contradicting prose is removed and its referrers redirected.

Non-goals: no draft-by-default; no derivation of change type from changed paths; no new file location for the tool.

**Correction to the ratified no-draft rationale.** The original wording said drafts add nothing because "Claude never merges under any origin". That is an overstatement and was reproduced as false: before this change `gh api graphql` carrying a `mergePullRequest` or `enablePullRequestAutomerge` mutation PASSED the live hook. The accurate statement, which this spec makes true, is: merge is human-gated by the hook (now including both GraphQL spellings), by the `Bash(gh pr merge:*)` and MCP `merge_pull_request` denies, and by GitHub-side review. Drafts add a click on top of that, not a control.

## 2. Why in place, not moved

The wrapper is ~90% generic already. These are preserved verbatim in behavior:

| Generic asset | Location | Kept because |
|---|---|---|
| Allowlist-only separated-long-form flag parser | `mitosis-git.mjs:75-109` | Rejects `--flag=value`, unknown flags, swallowed values, duplicate singles |
| Inert-text sanitizer and caps | `:35-38`, `:51-58` | Control-char strip, length cap, leading-at-sign rejection |
| Repo and ref validation | `:113-117` | `validateRepoIdentity`, `validateRefToken` |
| Idempotent observe-then-converge create | `:319-362` | Reuses an existing open PR; exit 21 is the documented AMBIGUOUS outcome |
| gh merge tripwire on every exec | `:219-240`, `:262-278` | Fail-closed classifier in front of every `gh` call |

A move would break three engine call sites, seven test files, and `gh-scope-lint.test.mjs`'s creation-site count for no functional gain. **The file path does not change and the verb name does not change.**

## 3. Title grammar

Machine and human PR titles use Conventional Commits ([conventionalcommits.org v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)). This matters because GitHub squash-merge seeds the squash commit subject from the PR title, and because the engine already deploys a Conventional-Commits PR-title lint to target repos.

**Grammar:** `<type>(<scope>): <summary>`

- `type` in `feat | fix | refactor | docs | test | chore | perf | ci`
- `scope` optional in the tool, **required for engine-composed titles**; `[a-z0-9][a-z0-9-]{0,15}` (max 16 chars)
- `summary` lowercase imperative, printable ASCII, at least 2 chars, no trailing period, no trailing space, no ticket id
- whole title at most 72 characters

**Literal validation regex (CORE-TOOL, exported as `PR_TITLE_PATTERN`):**

```js
export const PR_TITLE_PATTERN = /^(?=.{1,72}$)(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?: [a-z][\x20-\x7E]*[\x21-\x2D\x2F-\x7E]$/;
```

The `(?=.{1,72}$)` lookahead carries the length cap so the grammar is one literal. Unlike the previous revision, the summary class is now **explicitly printable ASCII** rather than `[^\n]*`, and the final character class excludes space (0x20) and the period (0x2E). The pattern therefore enforces the character policy on its own and does not depend on the sanitizer having run first - which matters because the engine carries a duplicate of this literal (section 12's drift guard) and that copy runs where the sanitizer does not.

**Aligned receipts.yml lint** (POSIX ERE, no lookahead available, so the cap is a separate shell test) - `.claude/skills/mitosis/templates/receipts.yml:23-32` becomes:

```yaml
      - name: Conventional Commits PR title
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          [ "${#PR_TITLE}" -le 72 ] \
            || { echo "PR title must be 72 characters or fewer (the squash commit subject)"; exit 1; }
          printf '%s' "$PR_TITLE" | grep -Eq '^(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?!?: [a-z].*[^ .]$' \
            || { echo "PR title must be Conventional Commits, lowercase imperative summary, no trailing period"; exit 1; }
```

Every string matching `PR_TITLE_PATTERN` matches this lint (strict subset: same type list, narrower scope class, the tool's summary class is a subset of the lint's, identical length cap).

**Trigger widened.** `receipts.yml:2-3` is currently `on: pull_request:` with no `types`, so it fires on `opened`, `synchronize` and `reopened` only - a human who opens with a compliant title and then edits it is never re-linted, which is exactly the residual this lint is claimed to backstop. It becomes:

```yaml
on:
  pull_request:
    types: [opened, edited, reopened, synchronize]
```

and the heavy `receipts` job gains `if: github.event.action != 'edited'` so a body edit re-runs only the title lint, never the enforcer and D6 suite.

**Latent defect fixed:** the current `mitosis: <mspId>` title fails this very lint because `mitosis` is not an allowed type (confirmed against `receipts.yml:31`). That prefix is removed entirely.

**Worked examples:**

| MSP fields | Composed title | Length |
|---|---|---|
| `changeType=refactor`, `scope=pr-tool`, `title=centralize pull-request creation` | `refactor(pr-tool): centralize pull-request creation` | 50 |
| `changeType=fix`, `scope=hooks`, `title=deny raw pr creation at the gate` | `fix(hooks): deny raw pr creation at the gate` | 43 |
| `changeType=docs`, `scope=rules`, `title=point the PR rule at the central tool` | `docs(rules): point the PR rule at the central tool` | 49 |

**Supersede titles** use the same grammar: `supersedePrTitleFor(msp)` composes `<changeType>(<scope>): supersede <mspId>`. Overflow is now structurally impossible rather than parked late: the MSP id is capped at 30 characters in the schema (section 4), so the worst case is 8 + 18 + 2 + 10 + 30 = 68 characters.

## 4. MSP-declared change type

The MSP declares its own change type at decomposition. Nothing is derived from changed paths.

**Schema change - `DECOMPOSE_SCHEMA`, `.claude/workflows/mitosis.js:1254-1276`:**

```js
required: ['id', 'title', 'rationale', 'changeType', 'scope', 'dependsOn', 'fileScope'],
properties: {
  id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,29}$' },
  title: { type: 'string', pattern: '^[a-z][\\x20-\\x7E]{0,38}[\\x21-\\x2D\\x2F-\\x7E]$' },
  rationale: { type: 'string', pattern: '^[A-Za-z0-9(][\\x20-\\x7E]{0,198}[\\x21-\\x7E]$' },
  changeType: { type: 'string', enum: ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci'] },
  scope: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,15}$' },
  dependsOn: { type: 'array', items: { type: 'string' } },
  fileScope: { type: 'array', items: { type: 'string' } },
},
```

Three things changed here versus the previous revision, all because the boundary where LLM output ENTERS must be at least as strict as the boundary that REJECTS it:

1. `title` is printable-ASCII by construction (2..40 chars, lowercase-initial, no trailing space or period). The previous `[^\n]{0,38}` admitted a bidirectional override or a Cyrillic homoglyph - the exact Trojan Source class the sanitizer cites as its own justification - which would then die at `pr-create` after all implementation work was done.
2. `rationale` is bounded at 200 characters (matching the single value cap of section 5) and starts with an alphanumeric or an open paren, so it cannot begin with the at-sign or a markdown block opener. A bare `{type:'string'}` guaranteed a late rejection on any ordinary-length rationale.
3. `id` is capped at 30 characters so `supersede <id>` cannot overflow the 72-character title.

`title` is repurposed as the imperative summary. It is **not** a new field: `title` already flows into the manifest, logs, plan prompts and the `MSP <title>` body line, and a lowercase imperative summary reads correctly in all of them. Adding a second near-identical human-readable string would guarantee drift.

**The caps make overflow structurally impossible.** Worst case: `refactor` (8) + parenthesised scope (18) + colon-space (2) + summary (40) = **68, under 72**. No truncation logic exists anywhere, and none is permitted.

**Where the decomposer emits it** - the decompose prompt at `.claude/workflows/mitosis.js:3766-3772` (the return line is `:3772`, the dispatch options are `:3773`). Three additions:

1. A declaration paragraph: each MSP declares `changeType` (one of the eight types, describing what the MSP does, never inferred from which files it touches) and `scope` (a short kebab-case subsystem noun, 16 chars or fewer).
2. The `title` instruction: "a lowercase imperative summary of 40 characters or fewer, printable ASCII only, with no trailing period - it becomes the Conventional-Commits summary of this MSP's PR title and therefore its squash commit subject." Plus, for `rationale`: "one sentence of 200 characters or fewer, printable ASCII only, starting with a letter or digit - it becomes the Why line of this MSP's pull-request body."
3. The return line becomes `{ msps: [ { id, title, rationale, changeType, scope, dependsOn, fileScope } ] }`.

**Flow to the title** - `.claude/workflows/mitosis.js:3145-3175` (corrected: `PR_TITLE_PREFIX` is at `:3145`, not `:3144`; `prDependsFlag` at `:3177-3181` is unchanged and stays):

```js
const PR_TITLE_TYPES = Object.freeze(['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
const PR_TITLE_PATTERN = /^(?=.{1,72}$)(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?: [a-z][\x20-\x7E]*[\x21-\x2D\x2F-\x7E]$/;
const PR_VALUE_LEAD = /^[A-Za-z0-9(]/;
const PR_VALUE_TAG = /<[!\/A-Za-z]/;
```

`PR_TITLE_PREFIX` and its `mitosis: ` composition are **deleted**.

**Signature change, called out because it is easy to miss.** `prTitleFor` and `supersedePrTitleFor` currently take a bare id string (`mitosis.js:3150`, `:3154`) and all three call sites pass strings today: `prTitleFor(id)` at `:3007`, `supersedePrTitleFor(msp.id)` at `:4070`, `prTitleFor(msp.id)` at `:4599`. Both functions now take the full MSP object, and all three call sites pass `msp`. The object is already in scope at every site (`const msp = shepherdMspById.get(id);` at `mitosis.js:2988`). Both return `null` when the composed string fails `PR_TITLE_PATTERN`.

**Fail-closed at three points:**

| Point | Condition | Behavior |
|---|---|---|
| Decompose acceptance (`mitosis.js`, immediately after `DECOMPOSE_SCHEMA` validation) | any MSP whose composed `prTitleFor` title OR composed `supersedePrTitleFor` title fails `PR_TITLE_PATTERN`, or whose `rationale` fails `PR_VALUE_LEAD` or matches `PR_VALUE_TAG` | run halts with `NeedsHuman({ kind: 'approve-decision', what: '<mspId> declared a changeType/scope/title/rationale that does not compose a valid pull-request title and body' })`. Never guesses a type |
| Manifest reuse (`mitosis.js:1515-1552`; insert beside the existing title/rationale type check at `:1525-1527`) | `changeType` or `scope` missing or not a string, OR the manifest's own fields do not COMPOSE a valid title and rationale value | `{ reusable: false, reason: '...' }`, forcing fresh decomposition |
| `pr-create` (`mitosis-git.mjs`) | `--title` fails `PR_TITLE_PATTERN`, or any value fails the section 8 sanitizer | usage exit `MITOSIS_GIT_USAGE_EXIT` (2), nothing executed |

The reuse check validates COMPOSABILITY, not just presence. A hand-edited manifest carrying `changeType` and `scope` but a title that fails the pattern was previously accepted at `:1525` (which only checks `typeof m.title !== 'string'`) and then failed at ship. It now forces fresh decomposition instead. This also subsumes the id-length check, so there is one check rather than two.

**Content hash:** `mspContentHash` (`mitosis.js:388-402`) appends `changeType` and `scope` to the canonical tuple: `JSON.stringify([id, title, rationale, changeType, scope, dependsOn, fileScope])`. This changes every hash, so an in-flight pre-migration manifest will not be reused on relaunch. That is correct: a pre-migration manifest carries no `changeType` and could not produce a compliant title.

`buildInitialManifest` (`mitosis.js:404-428`; the carry point is inside the `msps.map` body at `:415-426`, corrected from `:414-424`) carries `changeType: msp.changeType` and `scope: msp.scope` into each manifest MSP; the reuse path at `:1544` restores them.

## 5. Body: field set, order, caps, rendered output

The tool owns **document structure** (headings, ordering, blank lines, bullet markers, the `Verified:` / `Not verified:` split, the trailer). Callers supply **field values only** - inert, single-line, capped.

| Order | Section | Flag | Card. | Required |
|---|---|---|---|---|
| 1 | `## Why` | `--why` | 1..3 | **yes** |
| 2 | `## What` | `--what` | 1..5 | **yes** |
| 3 | `## Verification` | `--verified` | 0..8 | no; with `--not-verified`, combined at least 1 |
| 3 | `## Verification` | `--not-verified` | 0..8 | no; with `--verified`, combined at least 1 |
| 4 | `## Provenance` | `--provenance` | 0..1 | **yes iff `--origin machine`**; forbidden iff `--origin human` |
| 5 | `## Risk` | `--risk` | 0..1 | no |
| 6 | `## Links` | `--link` | 0..8 | no |
| 6 | `## Links` | `--supersedes` | 0..1 | no |
| 6 | `## Links` | `--depends` | 0..1 | no |
| 7 | size warning | `--changed-lines` | 0..1 | no |
| 8 | trailer | (tool-owned) | 1 | always |

**One value cap: 200 characters, for every free-text value.** The only other cap is the load-bearing 72 on `--title` (it is the squash commit subject and the CI lint checks it). The previous revision carried four caps and five ceilings, none of them derived from anything. `--supersedes` is canonicalized rather than capped; `--depends` keeps its existing 64-ids-by-64-chars bound (`mitosis-git.mjs:41-42`), unchanged.

Rendering rules:

1. Sections render in the fixed order above. An absent optional section is **omitted entirely** - never an empty heading.
2. Sections are separated by exactly one blank line. Within a section, one value per line.
3. `## Why`, `## Provenance` and `## Risk` values render bare at column 0. `## What` values and `--link` values render with a leading hyphen-space bullet. Because three sections render bare, sanitizer steps 8 and 9 apply to every value uniformly rather than only to the bare-rendered ones - a uniform predicate is cheaper to reason about than a per-section one, and an HTML tag opener is dangerous behind a bullet marker too.
4. `## Verification` renders every `--verified` value as `Verified: <value>` first, then every `--not-verified` value as `Not verified: <value>`.
5. `--supersedes` renders as its own line `SUPERSEDES <canonical-url>` and `--depends` as `DEPENDS-ON <id>, <id>` inside `## Links` (these exact line forms are preserved so the existing security tests at `tests/mitosis-git.test.mjs:321-343` continue to hold).
6. The size warning (section 10) and the trailer each render as their own paragraph, in that order, last.
7. Trailer text, tool-owned, by origin:
   - `machine`: `Opened by an automated agent through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.`
   - `human`: `Opened at human direction through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.`
   The `HUMAN-GATED` token is retained verbatim; an existing test asserts it (`tests/mitosis-git.test.mjs:332-337`).
8. **There is no rendered-body character cap.** The previous 12000 limit is deleted. The body is bounded by construction - the per-value cap times the cardinality ceilings, plus the depends bound, puts the widest composable body around 14k characters - and `tests/mitosis-git.test.mjs` already pins the widest composable body against GitHub's real 65536 limit. A second, lower, separately-enforced cap added a failure mode (a legitimate maximal `--depends` list would have been rejected), an unspecified enforcement point, and a constant to keep in sync, in exchange for nothing. The 300-word target survives as guidance in the engine prompt and the rule doc, never as a hard failure: rejecting a detailed verification list would push callers toward omitting real evidence, which attacks the honesty rule directly.

### Worked example A - machine-opened by the engine ship stage

This is the highest-volume invocation in the system. Note what it does NOT contain: a `Verified:` line. The ship stage opens the pull request at step 5 (`mitosis.js:4599`) and only waits for CI at step 6 (`:4600`), so at PR-open time every CI claim would be a prediction.

```
node /Users/satanshumishra/.claude/lib/superpowers-parallel/mitosis-git.mjs pr-create \
  --repo SatanshuMishra/.windful-ocean --head mitosis/pr-tool-engine-integration --base main \
  --title "refactor(pr-tool): compose pr bodies from declared fields" \
  --origin machine --provenance "agent=ship:pr-tool-engine model=opus" \
  --why "Four of the five paths that open a pull request invent the title and body ad hoc." \
  --what "compose pr bodies from declared fields" \
  --not-verified "CI on the fresh head and base - not run; this pull request opens before CI starts" \
  --depends "pr-tool-core" --changed-lines 512
```

Rendered body, literal (this is the byte-for-byte golden test of section 12):

```
## Why
Four of the five paths that open a pull request invent the title and body ad hoc.

## What
- compose pr bodies from declared fields

## Verification
Not verified: CI on the fresh head and base - not run; this pull request opens before CI starts

## Provenance
agent=ship:pr-tool-engine model=opus

## Links
DEPENDS-ON pr-tool-core

SIZE: this diff changes about 512 lines; review effectiveness drops sharply past 400 lines.

Opened by an automated agent through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.
```

The single `## What` bullet repeats the title summary. That is deliberate: the engine knows exactly two human-readable strings about an MSP (`title` and `rationale`), and a redundant bullet is the correct failure mode when the only alternative is invention.

### Worked example B - human-directed

Here a `Verified:` line is legitimate, because the caller actually ran the check.

```
node /Users/satanshumishra/.claude/lib/superpowers-parallel/mitosis-git.mjs pr-create \
  --repo SatanshuMishra/.windful-ocean --head docs/pr-rule-pointer --base main \
  --title "docs(rules): point the PR rule at the central tool" \
  --origin human \
  --why "The PR rule still described an ad-hoc gh workflow the gate now denies." \
  --what "pull-requests.md now points at mitosis-git pr-create" \
  --what "removed the ad-hoc test-plan-with-TODOs prose" \
  --verified "node --test hooks/tests/block-destructive-bash.test.mjs - 41 pass 0 fail" \
  --not-verified "no automated check covers rule prose - not run"
```

Rendered body:

```
## Why
The PR rule still described an ad-hoc gh workflow the gate now denies.

## What
- pull-requests.md now points at mitosis-git pr-create
- removed the ad-hoc test-plan-with-TODOs prose

## Verification
Verified: node --test hooks/tests/block-destructive-bash.test.mjs - 41 pass 0 fail
Not verified: no automated check covers rule prose - not run

Opened at human direction through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.
```

No `## Provenance` (origin is human), no `## Links`, no `## Risk`, no size warning. This example is covered by the ordering, omission and provenance-absent assertions rather than by a second golden test.

## 6. The honesty rule, as an implementable contract

Fluent machine output triggers automation bias; a fabricated test plan is strictly worse than an absent one because it converts an unknown into a false assurance. The `Verified:` / `Not verified:` split exists to make the unknown legible - which is also why section 8's structural guarantee is load-bearing rather than cosmetic: a split the reviewer cannot see does no work.

**The tool MUST:**

- Reject a `pr-create` invocation carrying zero `--verified` and zero `--not-verified` values (usage exit 2). The verification section can be empty of *evidence*, never empty of *statement*.
- Reject `--origin machine` without `--provenance`, and `--origin human` **with** `--provenance`.
- Validate `--provenance` against `/^agent=[A-Za-z0-9:._-]{1,64} model=[A-Za-z0-9:._-]{1,64}$/`. A free-form provenance string is where invented attribution would live.

**`--origin` is caller-asserted and the tool cannot verify it.** It selects trailer wording; it is not an authentication claim and nothing in this design treats it as one. Requiring `--provenance` on the human path was proposed and rejected: a human-directed caller frequently cannot know its own model string, and compelling a value the caller cannot know is exactly the fabrication this section exists to prevent. The machine path is different precisely because the engine composes the invocation as a literal and therefore knows both components.

**The tool MUST NOT - no code path may exist for any of these:**

- Default, infer, or derive a change type, scope, or summary. No fallback title.
- Emit a `Verified:` line the caller did not supply, for any reason including "the exit code was 0".
- Synthesize `--why`, `--what`, `--risk`, or `--provenance` from the environment, the diff, the branch name, or the commit messages.
- Substitute a placeholder (`TBD`, `N/A`, `see commits`) for a missing mandatory field. A missing mandatory field is a usage rejection.
- Truncate any value to make it fit. Over-cap is rejection.

**The caller's obligation** (carried in the engine prompts, in `.claude/rules/common/git/pull-requests.md`, and in the gate's deny reason): a check that was not run is emitted as `--not-verified "<thing> - not run"`. A check whose result is unknown is emitted as `--not-verified "<thing> - result not read"`. The tool enforces the structural floor; the prompt carries the epistemic duty.

## 7. CLI surface of the generalized `pr-create`

Parsing discipline is unchanged and non-negotiable: **allowlist-only, separated long-form flags only.** `--flag=value` is rejected. Unknown flags are rejected. A flag whose value is another allowlisted flag is rejected as a swallowed value. A `single` flag supplied twice is rejected. All of this is `collectFlags` (`mitosis-git.mjs:75-109`); only `FLAG_SPEC['pr-create']` and the required-flag loop change.

```js
'pr-create': Object.freeze({
  required: Object.freeze(['--repo', '--head', '--base', '--title', '--origin', '--why', '--what']),
  single: Object.freeze(['--repo', '--head', '--base', '--title', '--origin', '--provenance', '--risk', '--supersedes', '--depends', '--changed-lines']),
  multiple: Object.freeze(['--why', '--what', '--verified', '--not-verified', '--link']),
}),
```

`collectFlags` currently checks `required` membership against `single` only (`:103-107`); it must also satisfy a required flag from `multiple`. That is the one parser change: the required-flag loop checks `single.has(flag) || multiple.some((e) => e.flag === flag)`, which requires `multiple` to collect `{ flag, value }` pairs rather than bare values.

| Flag | Card. | Required | Validation |
|---|---|---|---|
| `--repo` | single | yes | `validateRepoIdentity` (owner/repo slug) |
| `--head` | single | yes | `validateRefToken` |
| `--base` | single | yes | `validateRefToken` |
| `--title` | single | yes | sanitizer(cap 72) then `PR_TITLE_PATTERN` |
| `--origin` | single | yes | exactly `machine` or `human` |
| `--why` | 1..3 | yes | sanitizer(cap 200) |
| `--what` | 1..5 | yes | sanitizer(cap 200) |
| `--verified` | 0..8 | no | sanitizer(cap 200); combined with `--not-verified` at least 1 |
| `--not-verified` | 0..8 | no | sanitizer(cap 200); combined with `--verified` at least 1 |
| `--provenance` | single | iff machine | sanitizer(cap 200) then the provenance pattern in section 6 |
| `--risk` | single | no | sanitizer(cap 200) |
| `--link` | 0..8 | no | sanitizer(cap 200) |
| `--supersedes` | single | no | `canonicalPrUrl` - **unchanged** (`mitosis-git.mjs:67-73`) |
| `--depends` | single | no | `parseDependsList` - **unchanged** (`:60-65`) |
| `--changed-lines` | single | no | `/^(0|[1-9][0-9]{0,6})$/` |

**`--body-line` is removed.** A free-form line flag is precisely the ad-hoc surface this spec exists to eliminate; the supersede site's interdiff summary becomes a `--what` value. Removing it is the difference between "one mandatory format" and "one mandatory format plus an escape hatch".

**`--review-order` was specified in the previous revision and is CUT.** Its stated trigger (a change touching more than about five files) is invisible to the tool, and it cost a flag, a cap, a cardinality bound, a distinct ordinal render rule and a test to express what numbered `--what` bullets already express. It is the only removal that does not touch the mandatory minimum.

`--supersedes` and `--depends` stay on `pr-create` rather than moving out: they are ordinary optional link fields once the mitosis-specific prefix constants are just two of many structure strings the tool owns. `MITOSIS_GIT_*` export names, the file path and the verb names do not change (section 2).

`renderPrCreateBody` stays a pure function of `opts` and is called from `buildGhArgv` at converge (`mitosis-git.mjs:201`) exactly as today. With the body cap deleted (section 5, rule 8) there is no rendering step inside `parsePrCreate` and no question about which side of the observe network call the rejection lands on.

## 8. The single centralized sanitizer

Sanitization currently lives in two places at two strictness levels - the aggressive char-class strip at `mitosis.js:3159` (`PR_BODY_INERT_STRIP`, which replaces everything outside `[A-Za-z0-9 .,:/_-]` with a space) and the milder `inertText` at `mitosis-git.mjs:51-58`. **Both engine-side constants (`PR_BODY_LINE_MAX`, `PR_BODY_INERT_STRIP`, `PR_BODY_TITLE_PREFIX`, `PR_BODY_SCOPE_PREFIX`, `prBodyLine`) are deleted.** One sanitizer, owned by the tool, is the only one.

Deleting the engine strip is what makes steps 8 and 9 below mandatory rather than optional: today that strip removes backtick, `<`, `>`, `#`, `|`, `*`, `[` and `]` from every engine-supplied body value. Once values travel verbatim, the tool is the only thing standing between an LLM-authored MSP field and a rendered GitHub document.

```js
export function inertValue(value, cap) { /* contract below */ }
```

Ordered contract - the first failing step returns `null`, and every `null` is a usage rejection naming the flag:

1. Not a string, reject.
2. Strip with the existing `CONTROL_CHARS` constant defined at `mitosis-git.mjs:35`, unchanged: it removes every C0 control character and DEL, which includes newline, carriage return and tab. Stripping rather than rejecting preserves the `--supersedes` control-char behavior that `tests/mitosis-git.test.mjs:321-330` pins.
3. Trim.
4. Empty after trim, reject.
5. Length over `cap`, reject. **Never truncate.**
6. Starts with the at-sign, reject. **Preserved verbatim from `:56`.** The at-sign is how the `gh` CLI reads an argument from a file, so permitting it would let a compromised agent exfiltrate local file contents into a public pull-request body.
7. Contains any character outside printable ASCII (0x20 through 0x7E), reject. Rejecting rather than stripping non-ASCII closes bidirectional-override and homoglyph attacks, where a value renders as one thing to a reviewer and is another thing in bytes ([Trojan Source, CVE-2021-42574](https://trojansource.codes/)).
8. Contains `<` immediately followed by `!`, `/`, or an ASCII letter - `/<[!\/A-Za-z]/` - reject. This is a strict superset of the previous revision's HTML-comment-opener rule and covers every raw-HTML tag opener.
9. First character is a backtick, `~`, `#`, `>` or `|`, OR the whole value consists only of `=` and `-` characters (`/^[=-]+$/`), reject. These are the markdown block openers (code fence, ATX heading, block quote, table row) and the setext heading underline.
10. Return the frozen string.

**Why the previous revision's step 8 was wrong.** It rejected only the HTML comment opener and closer, justified by the claim that a comment opener is "the one single-line construct that can comment out tool-owned structure that follows it". That claim is false, and section 5 rule 3 makes it exploitable, because `## Why` values render bare at column 0. Three counterexamples, all single-line, all previously accepted:

- A `--why` value of three backticks opens a fenced code block. Per CommonMark 4.5 an unclosed fence runs to the end of the document, so `## Verification`, every `Not verified:` line and the `HUMAN-GATED` trailer all render as preformatted text.
- A `--why` value of `<details>` is worse: GitHub supports the tag and balances it at document end, so the remainder of the body renders inside a collapsed disclosure and is hidden from the reviewer by default.
- A `--why` value of `## Verification` forges an empty section heading ahead of the real one.

Each of these attacks the honesty rule directly: the Verified / Not-verified split only counteracts automation bias if the reviewer sees it. The existing suite already treats this class as a security property - `tests/mitosis-git.test.mjs:332-337` asserts that no `<!--` reaches the body AND that `HUMAN-GATED` stays reachable - so the previous revision preserved one instance of the control while widening the character class that had made the others impossible.

The HTML comment CLOSER rejection is dropped as unnecessary: no tool-owned string contains an opener, and step 8 rejects every caller-supplied one, so a stray `-->` is inert literal text.

**Why tool-owned structure is unforgeable by caller values.** Every structural token (the section headings, the bullet marker, `Verified: `, `SUPERSEDES `, the trailer, the blank lines) is emitted by the renderer from a frozen constant. The invariant is not "there is one escape and we blocked it"; it is: **a caller value carries no newline (step 2), no HTML tag opener (step 8), and no leading block opener or setext underline (step 9), and therefore cannot open, close or suppress a section.** The document skeleton is a function of the flag set alone.

Every value in the section 5 worked examples remains valid under steps 8 and 9; none of them contains those characters in those positions.

`inertText` is renamed `inertValue` and remains a single exported function used by every value path in the file - `pr-close --comment` included - so the two strictness levels collapse to one everywhere, not just on `pr-create`.

## 9. The gate

### 9.1 Hook matching strategy

`.claude/hooks/block-destructive-bash.sh` already proves most of the required idiom on `gh pr merge` at `:25-31`. Two defects in that idiom were reproduced against the LIVE hook and must be fixed before the new block is added, because the new block inherits them:

| Reproduced against the live hook | Result |
|---|---|
| `gh pr merge 12` | DENY (baseline) |
| `gh pr \` + newline + `  merge 12` | **PASS** |
| `gh \` + newline + `pr merge 12` | **PASS** |
| `/opt/homebrew/bin/gh pr merge 12` | **PASS** |
| `gh api graphql -f query='mutation { mergePullRequest(...) }'` | **PASS** |
| `gh api graphql -f query='mutation { enablePullRequestAutomerge(...) }'` | **PASS** |
| `gh pr edit 12 --title x --body-file ~/.aws/credentials` | **PASS** |
| `gh api --method PATCH repos/o/r/pulls/12 -f title=x` | **PASS** |
| `gh api repos/o/r/pulls/ -f title=x -f head=y -f base=z` | **PASS** |

**Fix 1 - fold the match subject once, in the extractor.** `has()` pipes into `grep -Eq`, which matches per line, so `[[:space:]]+` can never span a newline. The fold belongs in the python3 command extractor at `:8-13`, which already exists and is already load-bearing (if it fails, `cmd` is empty and the hook exits 0 at `:14`). Adding two lines there introduces no new dependency and normalizes BOTH the lowercased subject used by `has` and the case-sensitive subject used by `has_cs`, so the two can never disagree:

```python
c = (d.get("tool_input") or {}).get("command", "") or ""
sys.stdout.write(" ".join(c.replace("\\\n", " ").split()))
```

**The `sed` implementation proposed in review is rejected as incorrect on this platform.** `sed -e ':a' -e 'N' -e '$!ba' -e 's/\\\n/ /g' ...` was tested on Darwin (BSD sed): for single-line input the `N` verb hits EOF and quits WITHOUT printing, so the command emits an empty string. Every ordinary one-line command would arrive at `has()` as the empty string and the entire hook - including the existing `rm -rf`, force-push and guardrail-file rules - would fail OPEN. Verified: single-line input produced 0 bytes; two-line input produced 3.

Collapsing every whitespace run to a single space also joins genuinely separate lines of a multi-line command. That is deliberate and fail-closed: the worst case is denying a two-line sequence whose concatenation happens to spell a denied pattern.

The full existing hook suite (25 tests) passes unchanged with this fold applied.

**Fix 2 - allow an optional path prefix on every `gh` pattern.** The current boundary `(^|[^[:alnum:]_./-])` excludes `/` from the characters allowed to precede `gh`, so any path-qualified invocation is invisible. One shared fragment replaces the ad-hoc boundary in the merge rule and in every new rule:

```bash
ghtok='(^|[^[:alnum:]_.-])([[:alnum:]_./-]*/)?gh[[:space:]]+'
```

Validated: this matches `gh pr create`, `/opt/homebrew/bin/gh pr create`, `./bin/gh pr create`, `FOO=1 gh pr create` and `git push && gh pr create`, and does NOT match `gh pr list`, `echo 'high pr create'`, or the wrapper's own `node <path>/mitosis-git.mjs pr-create`.

**Fix 3 - widen the existing merge rule** to cover both GraphQL spellings, routing them to the EXISTING merge deny reason at `:27`, not the new one. `enablePullRequestAutomerge` is the more dangerous of the two: it makes GitHub land the pull request itself once checks go green, with nothing further to intercept.

The rewritten merge block and the new creation/mutation block:

```bash
ghtok='(^|[^[:alnum:]_.-])([[:alnum:]_./-]*/)?gh[[:space:]]+'
ghapi="${ghtok}api([[:space:]]|$)"
graphql='(^|[[:space:]])graphql([[:space:]]|$)'
pullsep='repos/[^/[:space:]]+/[^/[:space:]]+/pulls/?([^/[:alnum:]]|$)'
pullnum='repos/[^/[:space:]]+/[^/[:space:]]+/pulls/[0-9]+([^/[:alnum:]]|$)'
postish='(--method[[:space:]=]+post|-x[[:space:]]+post|(^|[[:space:]])-f[[:space:]=]|--field[[:space:]=]|--raw-field[[:space:]=]|(^|[[:space:]])--input[[:space:]=])'
patchish='(--method[[:space:]=]+patch|-x[[:space:]]+patch)'
gqlopaque='((-f|-f|--field|--raw-field)[[:space:]=]+[a-z_]+=@|(^|[[:space:]])--input[[:space:]=])'

if has "${ghtok}pr[[:space:]]+merge([[:space:]]|$)" \
  || { has "$ghapi" && has 'pulls/[^/[:space:]]+/merge([^[:alnum:]]|$)'; } \
  || { has "$ghapi" && has "$graphql" && has '(mergepullrequest|enablepullrequestautomerge)'; }; then
  ... existing merge deny reason at :27 ...
fi

if has "${ghtok}pr[[:space:]]+create([[:space:]]|$)" \
  || { has "${ghtok}pr[[:space:]]+edit([[:space:]]|$)" && has '(--title|--body|--body-file)([[:space:]=]|$)'; } \
  || { has "$ghapi" && has "$pullsep" && has "$postish"; } \
  || { has "$ghapi" && has "$pullnum" && has "$patchish"; } \
  || { has "$ghapi" && has "$graphql" && has 'createpullrequest'; } \
  || { has "$ghapi" && has "$graphql" && has "$gqlopaque"; }; then
  ... the 9.2 deny reason ...
fi
```

Notes the implementer must not lose:

- **Post-creation mutation is inside the invariant, not outside it.** Creating through the wrapper and then running `gh pr edit 12 --title x --body-file ~/.aws/credentials` restored full ad-hoc control one command later, and `--body-file` needs no at-sign at all, so it defeated the step-6 exfiltration defense, the ASCII policy and the caps in a single move. The `gh pr edit` branch fires only when the command also carries `--title`, `--body` or `--body-file`, so `gh pr edit --add-label`, `--add-reviewer` and `--milestone` stay reachable.
- The `pullnum` + `patchish` branch is scoped to a specific pull-request number, so `pulls/N/comments` and `pulls/N/reviews` stay allowed.
- The `postish` alternation includes bare `-f` / `--field` / `--raw-field` / `--input`, not only an explicit method, because **`gh api` switches to POST implicitly**: "The default HTTP request method is `GET` normally and `POST` if any parameters were added" - [gh api manual](https://cli.github.com/manual/gh_api).
- `-F` and `-X` need no separate branch: `has` matches against the lowercased, folded command.
- `gqlopaque` closes the plain-usage GraphQL bypass. Reading a query from a file with `-F query=@file` is how the gh manual tells you to send a GraphQL query, so it is not an obfuscation class; without this branch `gh api graphql -F query=@create-pr.graphql` and `gh api graphql --input mutation.json` both passed. The deny reason tells the caller to inline the query so the gate can read it.
- `pullsep` now tolerates a trailing slash (`pulls/?`) while still not matching `pulls/1/comments` or `pulls/1/reviews`.
- Plain `gh pr create` matching does **not** catch the wrapper's own `node .../mitosis-git.mjs pr-create` - no `gh` token precedes `pr`, and the wrapper reaches `gh` through `spawnSync`, which the Bash PreToolUse hook never sees. There is no self-block, and section 12 pins that.

The existing `case` prefilter at `:3-6` already lets `gh` commands through unchanged.

**Verification status of this block.** The exact regex set above was prototyped and run against 41 cases: 8 merge-deny forms, 19 creation/mutation-deny forms, and 14 must-pass forms including the wrapper's own invocation, `gh pr edit --add-label`, POSTs to `pulls/N/comments` and `pulls/N/reviews`, a plain GET of the pulls endpoint, an inline read-only GraphQL query and `echo 'high pr create'`. All 41 behaved as specified.

### 9.2 The `permissionDecisionReason`

**Shortened deliberately.** The previous revision inlined the entire field set here, making the deny reason a third full restatement of the format with no drift guard, on the one path where drift is silent (it is the sole recovery route for the vendored P2/P3 callers). It now carries the skeleton, the honesty sentence, the inert-value rule, the printed-URL correction, and a pointer.

**Shell constraint:** assign with SINGLE quotes, so the string must contain no single-quote character, and (as with any shell string) no `$` and no backtick. The existing merge reason at `:27` is double-quoted and contains no quotes at all; the new one shows flag placeholders unquoted and instructs the caller to quote values, which is what keeps it single-quotable.

```
opening a pull request is centralized: every pull request in this environment is created by one tool, in one format, and its title and body may not be rewritten afterwards. Run this, quoting every value: node /Users/satanshumishra/.claude/lib/superpowers-parallel/mitosis-git.mjs pr-create --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH --title TYPE(SCOPE): LOWERCASE IMPERATIVE SUMMARY --origin machine-or-human --why PROBLEM AND WHY NOW --what BEHAVIORAL CHANGE --not-verified THING YOU DID NOT CHECK - not run. Types: feat fix refactor docs test chore perf ci; title max 72 characters, no trailing period. Add --provenance agent=LABEL model=MODEL when --origin is machine. NEVER write a --verified line for a check you did not run. Pass every value as ONE inert argv value: never a file path, never an at-prefixed value, never a shell redirection. A pull/new URL printed by git push is not an approved path either. Full field set and caps: .claude/rules/common/git/pull-requests.md
```

Section 12 pins this against drift with one assertion: the reason names every flag in `FLAG_SPEC['pr-create'].required`.

### 9.3 `settings.json` permission entries

Add to `permissions.deny` (`.claude/settings.json:37-73`, the array; the closing bracket is `:74`), after the existing `"Bash(gh pr merge:*)"` at `:53`:

```json
"Bash(gh pr create:*)",
"mcp__github__create_pull_request",
"mcp__plugin_github_github__create_pull_request",
"mcp__github__update_pull_request",
"mcp__plugin_github_github__update_pull_request",
"mcp__github__merge_pull_request",
"mcp__plugin_github_github__merge_pull_request"
```

Both MCP tool-id spellings are listed because the GitHub MCP may be registered directly or through a plugin; a deny entry naming an unregistered tool is inert, so listing both is free and closes P4 either way. The `update_*` and `merge_*` entries cost exactly the same and close the same two gaps the hook closes on the Bash side.

No new `allow` entry is needed for the wrapper - `"Bash(node:*)"` at `:21` (corrected from `:23`) already covers it.

**`Bash(gh pr edit:*)` is deliberately NOT added.** A literal prefix rule cannot discriminate `--add-label` from `--body-file`, so it would deny label edits the hook allows, and the two layers would contradict each other. As with `gh api`, the hook is the substantive control and the settings entry is defense in depth. Note also that `Bash(gh pr create:*)` is a literal prefix rule that the backslash-continuation form does not carry, which is another reason fix 1 in 9.1 is not optional.

### 9.4 Accepted residual risk - evasions this gate CANNOT close

Stated explicitly rather than hidden. None of these are closed by any part of this spec.

1. **Obfuscated shell payloads** - `sh -c` with a printf-hex, base64-decoded, or variable-assembled command. The hook matches literal lowercased text.
2. **Script indirection** - a committed `./open-pr.sh`, an `npm run` script or a `Makefile` target that calls the CLI internally. The hook sees the invoking command, not the script body.
3. **Runtime subprocess** - `node -e` with `child_process.execFile`, or `python -c` with `subprocess.run`. This is the same mechanism the wrapper itself uses, so it cannot be blocked without blocking the wrapper.
4. **`gh` aliasing** - defining a `gh` alias and invoking the alias.
5. **PATH shadowing** - a `gh` earlier on `PATH` that forwards to the real binary.
6. **`gh` reached through a command substitution that separates the token from its subcommand** - `$(which gh) pr create`. Reproduced as passing. The `ghtok` prefix closes path-qualified forms but not this one, because the intervening `)` breaks the whitespace requirement. It needs one more deliberate step than a path prefix and sits in the same family as items 4 and 5; accepted.
7. **Non-Bash network tools** - any MCP server with a generic HTTP capability could POST to the API. `curl`, `wget`, `nc`, `http` and `xh` are already denied at `.claude/settings.json:56-60` (corrected from `:57-61`); an arbitrary future MCP is not.
8. **Sibling body-carrying surfaces that are not pull-request creation** - `gh pr comment --body-file`, `gh issue create --body-file`, `gh release create --notes-file`. These do not create or edit a pull request, so they are outside this invariant, but they remain local-file-to-remote paths and are named here so nobody mistakes the gate for a general exfiltration control.
9. **The human in a browser** - including the `pull/new/<branch>` URL that `git push` prints, which is the vendored P3 skill's own documented fallback (see section 13). The receipts.yml title lint is the backstop, and section 3 makes it re-run on title edits so the backstop actually covers the case it claims to.

The gate's purpose is to make the centralized path the only reachable default for a cooperating agent and to make every accidental bypass loud. It is a guardrail against drift and mistake, not a sandbox against a determined adversary with shell access. Anyone who claims otherwise is overselling it.

## 10. Size warning

- **Threshold: 400 changed lines.** Review defect-discovery rate falls sharply past a few hundred changed lines, the same evidence base already cited by `.claude/rules/common/git/commits.md:11` for the 200-400 LOC target (SmartBear/Cisco review study; Google ~100-line CLs; DORA small batches) [unverified - the primary sources are cited in the existing rule, not re-fetched for this spec].
- **Behavior:** when `--changed-lines` is supplied and greater than 400, the renderer appends exactly one paragraph before the trailer: `SIZE: this diff changes about <n> lines; review effectiveness drops sharply past 400 lines.` When absent or 400 or fewer, nothing is emitted.
- **The tool does not compute it.** `pr-create` must not acquire a network failure mode for an advisory line.

**Correction: the previously claimed source does not exist.** The prior revision said "the engine already has a `compare` verb (`mitosis-git.mjs:213-215`) that returns the containment read". It was read: `buildGhArgv` at `:213-215` calls `repos/<repo>/compare/<base>...<head>` and `runCompare` (`:421-446`) emits only `{ahead_by, status}`. `ahead_by` is a COMMIT count, not a line count, and the engine's own compare prompt at `mitosis.js:4568-4570` returns the same two fields. Wiring it into `--changed-lines` would have put a wrong number in a public pull-request body.

**The real source is local and needs no network.** At the ship and shepherd-open sites the integration branch has just been rebased onto the fresh base, so:

```
git -C <repoRoot> diff --shortstat origin/<base>...<head>
```

yields a line of the form ` N files changed, I insertions(+), D deletions(-)`; `--changed-lines` is `I + D`. Three-dot `git diff` is the pull-request diff semantics (changes on head since the merge base), which is the number a reviewer sees.

- **If that read fails or does not parse, the flag and its value are dropped entirely.** Never estimate. `--changed-lines` is optional precisely so that omission is the honest fallback.
- The supersede site omits `--changed-lines`. Its meaningful size is the interdiff against the superseded pull request, not the full diff, and a full-diff number would mislead the reviewer of a superseding pull request.

## 11. Call-site contract, migration table, landing order

### 11.1 Who supplies which value

The previous revision never said this, and it is the single most consequential gap the reviews found. All three prompt sites today say "run EXACTLY this one command, verbatim, with no substitutions and nothing chained" (`mitosis.js:3007`, `:4599`) or "changing NOTHING except the quoted summary placeholder" (`:4070`). The engine composes the whole argv and the agent substitutes almost nothing, which is why the injection surface at these sites is currently near zero. That property is preserved.

**Rule: the engine composes every value as an engine-resolved literal. There are exactly two placeholder shapes across the three sites, and both are named below.** Nothing else is substituted, reworded, added or removed.

New engine helper, beside the title helpers:

```js
function prProvenanceFor(label, model) {
  return `agent=${label} model=${typeof model === 'string' && model.length > 0 ? model : 'unspecified'}`;
}
```

The model component is the literal the site's own `agent()` dispatch options carry, or `unspecified` when the site sets none. Verified: ship sets `model: 'opus'` (`:4603`); shepherd-open (`:3010`) and supersede (`:4074`, corrected from the reviewed `:4076`) set none. **Adding `model:` to those two dispatch options was proposed and rejected** - it changes which model actually runs those stages, which is a runtime behavior change outside this spec's mission. `unspecified` is literally true and costs nothing.

**Ship (`:4599`)** - one placeholder, digits only:

```
node ${LIB_DIR}/mitosis-git.mjs pr-create --repo ${repoSlug} --head ${integrationBranch} --base ${baseBranch} --title ${JSON.stringify(prTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(SHIP_LABEL, 'opus'))} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --not-verified "CI on the fresh head and base - not run; this pull request opens before CI starts"${prDependsFlag(msp.dependsOn)} --changed-lines <N>
```

**Shepherd-open (`:3007`)** - one placeholder, digits only:

```
node ${LIB_DIR}/mitosis-git.mjs pr-create --repo ${repoSlug} --head ${integrationBranch} --base ${baseBranch} --title ${JSON.stringify(prTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(SHEPHERD_LABEL, null))} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --not-verified "CI on the fresh head and base - not run; this pull request opens before CI starts" --changed-lines <N>
```

**Supersede (`:4070`)** - one placeholder, free text, exactly the one that exists today:

```
node ${LIB_DIR}/mitosis-git.mjs pr-create --repo ${repoSlug} --head ${supersedeBranch} --base ${baseBranch} --title ${JSON.stringify(supersedePrTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(SUPERSEDE_LABEL, null))} --why "The prior pull request for this MSP was invalidated by a divergent parent merge." --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --what "<your one-line interdiff summary from step 2>" --not-verified "CI on the superseding head - not run; this pull request opens before CI starts" --supersedes ${JSON.stringify(canonicalPriorPrUrl)}
```

`SHIP_LABEL`, `SHEPHERD_LABEL` and `SUPERSEDE_LABEL` above stand for the template expressions composing `ship:<mspId>`, `shepherd-open:<mspId>` and `supersede:<mspId>` from the id already in scope at each site. Worst-case label length is 14 + 30 = 44, inside the 64-character provenance bound.

| Site | Placeholder | Guard |
|---|---|---|
| `:3007` shepherd-open | `<N>` for `--changed-lines` | `/^(0|[1-9][0-9]{0,6})$/` - a non-digit value is a usage rejection, so this substitution carries no text into the document at all |
| `:4599` ship | `<N>` for `--changed-lines` | same |
| `:4070` supersede | `<your one-line interdiff summary from step 2>` for one `--what` | the existing warning is carried verbatim: "Pass that summary as ONE inert argv VALUE: never a file path, never an at-prefixed value, never a shell redirection" |

Each prompt gains one sentence: **"Change NOTHING except the named placeholder. Do not add, remove or reword a flag. If you cannot read the changed-lines integer from `git -C <repoRoot> diff --shortstat origin/<base>...<head>`, delete `--changed-lines <N>` (both tokens) and run the rest verbatim - never estimate it."** Supersede's sentence names its summary placeholder instead and simply does not carry `--changed-lines`.

Why this and not agent-authored `--why` / `--what` / `--verified`: the ship agent at step 5 has run fetch, merge-base, rebase and push - it has run no tests, and CI starts at step 6. Its honest `Verified:` set is empty. Letting it author verification text would create four independent substitution contracts across four implementers, add a text injection surface at the three highest-volume sites, and invite exactly the fabricated-assurance failure section 6 exists to prevent. Quality over uniformity: the engine says less, truthfully.

### 11.2 File ownership is disjoint; landing order is not free

**Every file below is owned by exactly one unit. No file appears twice.** But disjoint ownership is necessary, not sufficient: CORE-TOOL's stricter parser and ENGINE's embedded command strings are coupled by contract. If ENGINE lands first, every engine-issued `pr-create` hits a usage exit 2 and the ship, shepherd and supersede stages break at exactly the call sites this spec is fixing.

```
CORE-TOOL  ->  ENGINE
CORE-TOOL  ->  GATE
RULES-CI   (independent)
```

Express these as real `dependsOn` edges in the mitosis decomposition, not as an informal ordering note. RULES-CI is genuinely independent: its receipts lint change is deployed to target repos and the current `mitosis:` title already fails the current lint, so there is no window in which RULES-CI landing first makes anything worse.

#### CORE-TOOL

| File | Anchor | Change |
|---|---|---|
| `.claude/lib/superpowers-parallel/mitosis-git.mjs` | `:17-45` | `FLAG_SPEC['pr-create']` per section 7; delete `BODY_TRAILER` (`:45`); keep `SUPERSEDES_PREFIX` / `DEPENDS_PREFIX` (`:43-44`); replace `TITLE_CAP` 256 / `LINE_CAP` 512 / `BODY_LINE_CAP` 64 with `TITLE_CAP` 72 and one `VALUE_CAP` 200 (`DEPENDS_CAP` and `DEPENDS_ID_CAP` at `:41-42` unchanged). `canonicalPrUrl` (`:71`) and `pr-close --comment` (`:156`) move from `LINE_CAP` to `VALUE_CAP` |
| same file | `:51-58` | `inertText` becomes `inertValue` with the section 8 ten-step contract; all call sites updated |
| same file | `:75-109` | `collectFlags` collects `multiple` as flag/value pairs; the required-flag loop at `:103-107` accepts a `multiple` satisfier |
| same file | `:111-147` | `parsePrCreate` validates the full section 7 field set, `PR_TITLE_PATTERN`, cardinality, and the section 6 cross-field rules |
| same file | `:187-194` | `renderPrCreateBody` implements the section 5 template; stays a pure function of `opts` |
| same file | `:196-217` | `buildGhArgv` unchanged in shape |
| same file | new exports | `PR_TITLE_PATTERN`, `PR_TITLE_TYPES`, `inertValue` |
| `.claude/lib/superpowers-parallel/pr-format.mjs` | new file | `inertValue`, `PR_TITLE_PATTERN`, `PR_TITLE_TYPES`, the field spec and `renderPrCreateBody`; `mitosis-git.mjs` re-exports them so no existing import breaks. Split because `mitosis-git.mjs` would otherwise pass roughly 700 lines |
| `.claude/lib/superpowers-parallel/tests/mitosis-git.test.mjs` | section 12 | section 12 |
| `.claude/lib/superpowers-parallel/tests/pr-format.test.mjs` | new file | section 12 |

#### ENGINE

| File | Anchor | Change |
|---|---|---|
| `.claude/workflows/mitosis.js` | `:388-402` | `mspContentHash` canonical tuple gains `changeType`, `scope` |
| same file | `:404-428` (carry point `:415-426`, corrected from the reviewed `:414-424`) | `buildInitialManifest` carries `changeType`, `scope` |
| same file | `:1254-1276` | `DECOMPOSE_SCHEMA` per section 4 |
| same file | `:1515-1552` (insert beside the title/rationale type check at `:1525-1527`; the previously cited `:1524-1544` opens on the unrelated duplicate-id check) | manifest reuse rejects a missing `changeType` / `scope` AND a manifest whose fields do not compose a valid title and rationale value |
| same file | `:3145-3175` (corrected from `:3144-3181`) | delete `PR_TITLE_PREFIX`, `PR_BODY_LINE_MAX`, `PR_BODY_INERT_STRIP`, `PR_BODY_TITLE_PREFIX`, `PR_BODY_SCOPE_PREFIX`, `prBodyLine`; rewrite `prTitleFor` / `supersedePrTitleFor` (both now take `msp`, not `mspId`) and `prBodyFlags`; add the local `PR_TITLE_PATTERN`, `PR_VALUE_LEAD`, `PR_VALUE_TAG` literals and `prProvenanceFor`. `prDependsFlag` (`:3177-3181`) is unchanged |
| same file | after `:3773` | decompose-acceptance validation of BOTH composed titles and the rationale predicate, `NeedsHuman` on failure |
| same file | `:3766-3772` | decompose prompt emits `changeType`, `scope`, the imperative-`title` instruction and the bounded-`rationale` instruction; the return line at `:3772` gains the two fields |
| same file | `:3007` | shepherd-open: the 11.1 invocation; `prTitleFor(id)` becomes `prTitleFor(msp)` |
| same file | `:4070` | supersede: the 11.1 invocation; `supersedePrTitleFor(msp.id)` becomes `supersedePrTitleFor(msp)` |
| same file | `:4599` | ship: the 11.1 invocation; `prTitleFor(msp.id)` becomes `prTitleFor(msp)` |
| `.claude/lib/superpowers-parallel/tests/frontier-train-e2e.test.mjs` | `:13`, `:495`, `:499` | section 12 |
| `.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs` | `:19`, `:1286`, `:1313`, `:1341` | section 12 |
| `.claude/lib/superpowers-parallel/tests/gh-scope-lint.test.mjs` | `:16`, `:87-95` | section 12 |

**Formatting constraint the implementer must not break.** `gh-scope-lint.test.mjs:93-111` splits `mitosis.js` on newlines, filters to lines containing the wrapper invocation, requires exactly three, and requires each such LINE to also contain `Exit 21 is AMBIGUOUS` and `a pull request MAY exist`. The new flag set roughly doubles three already very long single lines, and the natural instinct to wrap the invocation onto its own template line silently breaks this test. **At each of the three sites the wrapper invocation and the exit-21 wording stay on ONE source line.**

#### GATE

| File | Anchor | Change |
|---|---|---|
| `.claude/hooks/block-destructive-bash.sh` | `:8-13` | the 9.1 fold, inside the existing python3 extractor |
| same file | `:25-31` | the merge rule gains the `ghtok` path prefix and the two GraphQL merge mutation names; its deny reason at `:27` is unchanged |
| same file | after `:31` | the 9.1 creation/mutation deny block and the 9.2 reason (assigned with single quotes) |
| `.claude/hooks/tests/block-destructive-bash.test.mjs` | `:13-42` | section 12 - the `gh pr create` assertion **inverts** |
| `.claude/settings.json` | `:37-73` | the seven 9.3 deny entries |

#### RULES-CI

| File | Anchor | Change |
|---|---|---|
| `.claude/rules/common/git/pull-requests.md` | whole file | rewritten to a short pointer: the mandated title grammar, the field-set table, the honesty rule, the exact wrapper invocation. The current steps 1-5 ("Draft a comprehensive PR summary", "Include a test plan with TODOs", "Use the gh CLI") are **deleted** - they describe the ad-hoc path the gate now denies. The per-MSP PR policy and the green-branch invariant are retained verbatim |
| `.claude/rules/common/git-workflow.md` | `:5`, `:16` | redirect to the tool; drop the phrasing that implies a free-form PR process |
| `.claude/rules/common/git/commits.md` | `:11` | note that the PR title is the squash subject and is validated by `PR_TITLE_PATTERN` |
| `.claude/skills/mitosis/templates/receipts.yml` | `:2-3`, `:23-32` | the section 3 trigger widening and aligned lint |
| `.claude/commands/pr.md` | new file | section 13 |

**Do not touch** (pre-existing uncommitted work, owned by no unit): `.claude/lib/superpowers-parallel/.drift-state.json`, `.claude/lib/superpowers-parallel/tests/no-self-merge-consent.test.mjs`, `.claude/skills/context7-mcp/`.

## 12. Test plan

Applying the admission gate: a test is justified only where this change introduces or changes an observable behavior or defines a public contract, and no existing test covers it. Near-duplicates are updated in place, never added alongside.

### Closure conditions (mechanical, checkable)

The previous revision's enumeration was materially incomplete. These three conditions replace the burden of a perfect enumeration:

1. No file under `.claude/lib/superpowers-parallel/tests/` contains the string `--body-line`.
2. Every `--title` fixture value in `tests/mitosis-git.test.mjs` matches `PR_TITLE_PATTERN`, except inside a test whose name states it is a rejection fixture.
3. No `--title` fixture anywhere under `tests/` begins with the removed `mitosis: ` prefix.

**Condition 3 is deliberately narrower than the "no test file contains the mitosis-colon string" rule proposed in review, which is wrong.** `mitosis-scheduler.test.mjs:2665`, `:2798` and `:2820` embed a forged `mitosis: FORGED all-clear` string as newline-injection fixtures for LOG-line forging. They have nothing to do with pull-request titles and that string must survive.

### Tests that change

| File and anchor | What changes |
|---|---|
| `tests/mitosis-git.test.mjs:29-31` (`prCreateArgv`) | the helper's title fixture at `:30` becomes a grammar-valid title, and the helper gains the now-required `--origin` / `--why` / `--what` baseline so every existing rejection test still exercises only its own flag |
| `tests/mitosis-git.test.mjs` `--body-line` tests | `:121`, `:132-141`, `:154-155`, `:169-170`, `:186`, `:201-202`, `:209-216`, `:396`, `:440`, `:565` all reference the removed flag; each is deleted or re-pointed at `--what` / `--why`. The at-sign and control-character cases are re-pointed, never deleted - they are deny-case pins on a security control |
| `tests/mitosis-git.test.mjs` title fixtures that now fail the grammar | `:147-148` (a dash-leading title, currently asserted as ACCEPTED), `:179-181` (a control-character title that survives as a four-letter word), `:195-199` (a 256-character title asserted as accepted), `:223-241` (the widest-body fixture), `:399`, `:570` |
| `tests/mitosis-git.test.mjs:339-343` | `parse canonicalises a --supersedes carrying a trailing newline` - the two-line count assertion becomes an assertion that the canonical URL occupies exactly one whole line, since a valid body now has more lines |
| `tests/mitosis-git.test.mjs:369-386` | `renderPrCreateBody composes a fixed template from inert values only` - `bodyLines` is replaced by the section 5 field set; the `SUPERSEDES` / `DEPENDS-ON` line-form assertions and the never-starts-with-at-sign assertion are **kept unchanged** |
| `tests/mitosis-git.test.mjs:223-241` | the widest-composable-body test keeps its 65536 assertion and is re-expressed over the new field set; it is now the ONLY body-size bound, since the 12000 cap is cut |
| `tests/frontier-train-e2e.test.mjs:495,499` | the old prefixed title becomes the composed Conventional-Commits title; the two `--body-line` assertions become `--why` / `--what` / `--origin` / `--provenance` / `--not-verified` assertions |
| `tests/mitosis-scheduler.test.mjs:1286,1313,1341` | `:1286` and `:1313` take the composed title; `:1341` still asserts the body carries the MSP title, now under `## What` |
| `tests/gh-scope-lint.test.mjs:16,87-95` | `PR_CREATE_SITES = 3` is **unchanged** (the count is the point); the wrapper-anchoring and one-line exit-21 assertions are unchanged; add an assertion that the engine source contains no `--body-line` |
| `hooks/tests/block-destructive-bash.test.mjs:33` | **`gh pr create --head x --base y` currently sits in `allowCommands` and asserts the gate PASSES it. That assertion inverts: the string moves to `denyCommands`.** This is the single most easily-missed edit in the change |
| `hooks/tests/block-destructive-bash.test.mjs:35` | `gh pr edit 12 --add-label x` **stays** in `allowCommands` - it is the false-positive pin for the discriminated `gh pr edit` rule |

### New tests (each clears the admission gate)

| Test | File | Justification |
|---|---|---|
| Title grammar accepts the three section 3 examples and rejects: missing type, uppercase summary, trailing period, trailing space, 73 characters, 17-character scope, the removed prefix, a non-ASCII summary | `tests/pr-format.test.mjs` | new public contract (`PR_TITLE_PATTERN`), no existing coverage |
| Sanitizer rejects a non-ASCII value; rejects an HTML comment opener, a `details` tag opener and a closing tag; rejects a leading backtick, tilde, hash, angle-bracket and pipe; rejects an all-equals and an all-hyphen value; strips control chars; still rejects a leading at-sign | `tests/pr-format.test.mjs` | steps 7-9 are new behavior; the step 6 assertion is a deny-case regression pin on a security control |
| Renderer omits absent optional sections entirely (no empty headings) and emits sections in the fixed order | `tests/pr-format.test.mjs` | new observable contract; also the coverage for worked example B |
| Renderer emits worked example A byte-for-byte | `tests/pr-format.test.mjs` | the literal output is the spec's contract across independent implementers. ONE golden body, not two: the second was change-detector shaped and the ordering, omission and provenance-absent tests already assert example B's contract behaviorally |
| Structure is unforgeable **through a bare-rendered field**: `--why` values of a triple backtick, a `details` tag opener, an HTML comment opener and a literal section heading are each REJECTED, and in every accepted case the rendered body still matches a line-anchored `## Verification` and still contains `HUMAN-GATED` | `tests/pr-format.test.mjs` | the load-bearing security property of section 8. The previous revision pinned this only on `--what`, which renders behind a bullet marker and therefore could not have exhibited the defect |
| `pr-create` rejects zero verification lines; rejects `machine` without `--provenance`; rejects `human` with `--provenance`; rejects a malformed provenance | `tests/mitosis-git.test.mjs` | the honesty rule's enforceable floor |
| `pr-create` rejects `--body-line` and `--review-order` as unknown flags | `tests/mitosis-git.test.mjs` | pins both escape hatches closed |
| Size warning appears at 401 and is absent at 400 and when the flag is absent | `tests/pr-format.test.mjs` | boundary of a new behavior |
| Gate denies: `gh pr create`; a leading env assignment before it; a compound command whose second subcommand is it; **a backslash continuation between the `pr` and `create` tokens, and between the `gh` and `pr` tokens**; **a path-qualified `/opt/homebrew/bin/gh pr create`**; `gh pr edit` with `--title`, with `--body`, and with `--body-file`; an explicit POST to the pulls endpoint; a field-flag POST with no explicit method; a trailing-slash pulls POST; a lowercase `-x post`; a PATCH to a numbered pull; a GraphQL `createPullRequest` mutation; a GraphQL query read from a file; a GraphQL `--input` payload | `hooks/tests/block-destructive-bash.test.mjs` | each is a distinct evasion class the gate claims to close, and six of them were reproduced as PASSING before this change |
| Gate denies (merge regressions closed by the same fixes): a backslash-continuation `gh pr merge`; a path-qualified `gh pr merge`; a `mergePullRequest` GraphQL mutation; an `enablePullRequestAutomerge` GraphQL mutation | `hooks/tests/block-destructive-bash.test.mjs` | the fold and the `ghtok` prefix close pre-existing holes in the merge rule; without pins they regress silently |
| Gate allows: a field-flag POST to the pull comments endpoint and to the pull reviews endpoint; a plain GET of the pulls endpoint; `gh pr list`; `gh pr view`; `gh pr edit --add-label`; an inline read-only GraphQL query; and the wrapper's own `node <path>/mitosis-git.mjs pr-create` invocation | `hooks/tests/block-destructive-bash.test.mjs` | false-positive pins; the last one proves no self-block |
| The 9.2 deny reason names every flag in `FLAG_SPEC['pr-create'].required` | `hooks/tests/block-destructive-bash.test.mjs` | the only drift guard on the format's third restatement, which is the sole recovery path for the vendored callers |
| The engine's `PR_TITLE_PATTERN` literal is identical to the tool's exported `PR_TITLE_PATTERN`, and the engine's decompose-acceptance predicate agrees with the tool's `inertValue` accept/reject verdict on a shared character-class fixture list | `tests/gh-scope-lint.test.mjs` | `mitosis.js` is evaluated as a function body and cannot use ESM imports (confirmed by `frontier-train-e2e.test.mjs`'s `AsyncFunction` construction), so both are necessarily duplicated; this is the drift guard for both duplications. It lives in ENGINE's file and imports CORE-TOOL's export, which is why ENGINE depends on CORE-TOOL |
| Every composed engine title from a fixture MSP set passes the receipts.yml lint regex | `tests/gh-scope-lint.test.mjs` | closes the latent defect where the old prefix failed the engine's own deployed lint |

The 41-case gate matrix in section 9.1 was executed against a prototype of the exact regex set before this revision was written; the deny and allow tables above are that matrix, not an aspiration.

No test is added for the rule-document rewrites (config/copy exemption).

## 13. The human-directed path, end to end

P2 and P3 are vendored and cannot be edited - a plugin update would overwrite any change. The gate sits at the point of execution rather than the point of authorship, which is what lets it cover them without editing them.

Flow:

1. The human runs `/commit-push-pr` (P2) or the finishing-a-development-branch skill (P3). The vendored instructions tell the model to run bare `gh pr create`.
2. The Bash PreToolUse hook denies it and returns the 9.2 reason, which is a fill-in-the-blanks invocation, not a refusal. For P2 this is the substantive control: the vendored command's own frontmatter pre-authorizes the bare CLI form, so the settings deny alone would not stop it.
3. The model already holds every value the template needs: it just wrote the commits (`--why`, `--what`), it knows what it ran (`--verified` / `--not-verified`), `gh repo view` and `gh pr list` are allowed (`.claude/settings.json:31-33`), and `git rev-parse` is allowed (`:12`). It re-issues through the wrapper, which `Bash(node:*)` already permits.

**Correction to the previous revision's coverage claim.** It said the gate makes the vendored authorship irrelevant. That is true for P2 and for P3's CLI path, but not for all of P3. The vendored skill does not instruct a bare `gh pr create` at all; it says to create the request "with the forge's tooling - its CLI if one is available, or the creation URL most forges print when you push". So when the gate denies the CLI, P3's own documented next-best action is to hand the human the branch-creation URL that `git push` printed - producing an unformatted pull request with no denial event and no recovery template. **The gate closes P3's CLI path; P3's printed-URL fallback lands under residual 9 and is accepted.** Two cheap mitigations are taken rather than pretending otherwise: the 9.2 deny reason and `commands/pr.md` both state that a printed branch-creation URL is not an approved path, and the receipts title lint (section 3) now re-runs on title edits so the CI backstop actually covers the case it is claimed to cover. Stronger coverage would require making that lint a mandatory deployment on every target repo, which is out of scope here.

This is a working recovery, but it costs one denied round trip on every human-directed pull request. So one forward path is added, and only one:

**`.claude/commands/pr.md`** - a static slash command, no logic, that instructs the model to resolve repo slug, head and base, then invoke the wrapper. **It is a POINTER, not a restatement**: it carries the skeleton invocation, the honesty sentence, the not-an-approved-path sentence, and a link to `pull-requests.md` for the field set and caps. The previous revision justified it as adding "no second source of truth" while it was in fact the third; keeping it a pointer is what makes that justification true.

Nothing else is added. No wrapper shell script, no git alias, no new agent.

## 14. Rationale record for thin-evidence and contested calls

| Call | One-sentence rationale |
|---|---|
| Constrain `title` to a 40-character imperative rather than adding a `prSummary` field | Two near-identical human-readable strings on the same object guarantee drift, and `title` already reads correctly as an imperative in every existing consumer. |
| Scope capped at 16, summary at 40, MSP id at 30 | Makes both the 72-character composed cap and the supersede-title cap structurally unreachable, so no truncation logic and no late-parking overflow path needs to exist. |
| No breaking-change marker emitted | No MSP field carries breaking-ness and inventing one is gold-plating; the CI lint stays permissive so a human retains the option. |
| Remove `--body-line` | A free-form line flag is exactly the ad-hoc surface this change exists to remove. |
| Remove `--review-order` (CUT) | Its trigger is invisible to the tool and numbered `--what` bullets already express it; it was the only field whose removal does not touch the mandatory minimum. |
| Remove the 12000-character body cap (CUT) | The body is already bounded by construction and pinned against GitHub's real limit by an existing test; a second lower cap added a failure mode, an unspecified enforcement point and a constant to keep in sync, for nothing. |
| `--what` floor of 1, not 2 (CUT) | A genuinely single-behavior pull request has one bullet, and a floor of 2 combined with the no-placeholder and no-truncation rules left the caller no move except inventing a second bullet - a cardinality constant defeating the honesty rule. |
| One value cap (200) and three cardinality ceilings (3, 5, 8) | The numbers are arbitrary-but-fixed bounds chosen to keep a body reviewable; they are not derived from anything, and this row exists so no future reader hunts for a derivation. |
| Reject non-ASCII instead of stripping it, and enforce it at the schema too | Silent stripping changes the meaning a reviewer approved; loud rejection makes the caller restate it, and enforcing it at decomposition means the rejection lands where `NeedsHuman` already exists rather than after the branch is pushed. |
| Engine composes every value; two named placeholders only | Preserves the near-zero injection surface the three sites have today, avoids four implementers inventing four substitution contracts, and keeps the highest-volume caller structurally incapable of fabricating a `Verified:` line. |
| Ship emits a literal `--not-verified` for CI | The pull request opens at step 5 and CI starts at step 6, so any CI claim at open time is a prediction; the honesty rule makes an accurate absence better than a plausible presence. |
| `model=unspecified` rather than adding `model:` to two dispatch options | Naming a model the site does not set would be invention; changing what the sites set would be a runtime behavior change outside this spec. |
| `--provenance` required only for `--origin machine` | A human-directed caller often cannot know its own model string, and compelling an unknowable value is precisely the fabrication the honesty rule forbids. |
| The engine's `prBodyValueOk` is deliberately STRICTER than the tool's `inertValue` | The engine interpolates each value into a double-quoted shell command an agent runs verbatim, where `$`, a backtick and a backslash would substitute, so it adds `PR_VALUE_SHELL` and a printable-ASCII/200-cap check on top of the section 4 predicates; the drift guard therefore asserts CONTAINMENT (engine-accepted implies tool-accepted), never equality. |
| Both sanitizers reject a value that opens with a tool-owned line prefix (`Verified:`, `Not verified:`, `SIZE:`, `SUPERSEDES `, `DEPENDS-ON `) | `## Why`, `## Risk` and `## Provenance` values render bare at column 0, so a value IS a whole line and could impersonate the tool's line grammar - forging a `Verified:` line through the `--why` channel while the real verification section carried only `--not-verified`, which attacks the honesty rule head on. |
| The reuse path reports `reused-unverified` rather than `reused` when the existing open PR carries no tool trailer | Reusing an out-of-format pull request and reporting it as `reused` would let a bypass launder into a compliance receipt; the tool must not assert a format it did not compose. Hard-failing was rejected because a legacy or human-opened PR on the head would then block ship for a violation that already happened. |
| The fold lives in the python3 extractor, not in `sed` | Verified on Darwin: the reviewed `sed` slurp idiom emits nothing for single-line input, which would have made the entire hook fail open on every ordinary command. |
| `Bash(gh pr edit:*)` not added to `permissions.deny` | A literal prefix rule cannot tell `--add-label` from `--body-file`, so it would contradict the hook; the hook discriminates and the settings list stays defense in depth. |
| Add `.claude/commands/pr.md` as a pointer | Without a forward path every human-directed pull request pays a denied round trip; keeping it a pointer is what stops it becoming a fourth copy of the format. |
