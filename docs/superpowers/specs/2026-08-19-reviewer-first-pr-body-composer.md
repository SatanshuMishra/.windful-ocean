# SPEC: Reviewer-First PR Body Composer

**Status:** approved, ready to execute
**Date:** 2026-08-19
**Target repo:** `/Users/satanshumishra/Documents/DevLabs/.windful-ocean`
**Executing agent:** assume zero prior context. Everything needed is here.
**Governing decision:** `0631` (remove all attribution from PR bodies)

---

## 0. Orientation

Two files do almost all the work.

| File | Lines | Role |
|---|---|---|
| `.claude/lib/git/pr-format.mjs` | 121 | Pure. Grammar constants, the `inertValue` sanitizer, `renderPrCreateBody`. No I/O. **Most of this change lands here.** |
| `.claude/lib/git/pr.mjs` | 580 | Argv parsing, validation, `gh` execution, observe-then-converge state machine. |

Plain-word glossary, because the code assumes none of it:

- **PR body** — the description text of a GitHub pull request. `renderPrCreateBody` builds it from command-line flag values.
- **`inertValue`** — a sanitizer that rejects a caller-supplied value which could impersonate document structure (leading `#`, backtick, `>`, `|`, `~`, an HTML tag opener, a non-ASCII character). It is an **anti-forgery** check. It has never checked readability and never will.
- **Reuse detection** — before creating a PR, the tool looks for one already open on the same branch, then decides whether that PR was composed by this tool. Today it decides by checking for a trailer sentence at the end of the body.
- **The enforcer** — an external CI job (`receipts/gates@1.1`) that reads the PR body looking for specific tokens at the start of a line.

Run tests with **explicit file paths**. The directory form fails with `MODULE_NOT_FOUND` on Node v26.4.0.

Baseline, measured 2026-08-19: `node --test .claude/lib/git/tests/pr-format.test.mjs .claude/lib/git/tests/pr.test.mjs` → **311 tests, 311 pass, 0 fail**.

---

## 1. Goals

| # | Goal | Testable outcome |
|---|---|---|
| G1 | The body leads with **what** the change is | The first line of every rendered body is exactly `## What changed`. Section order is fixed and asserted byte-for-byte. |
| G2 | The body reads as **plain, human language** | No tool-injected identifier, internal id, file path or size number appears in the body. Every prose field value is structurally sentence-shaped. The unenforceable half is written into the three prose surfaces agents and humans read. |
| G3 | **All AI/agent/model attribution is removed and cannot return** | No trailer, no `## Provenance`, no `--origin`, no `--provenance` anywhere in production source or the human-facing standard. A census test over globbed source files fails if any reappears. |

On G3, **"reliably blocked" means the code path does not exist.** A deleted flag is rejected for free by the existing unknown-flag check at `pr.mjs:103`. No new guard defends a deleted path.

---

## 2. Non-goals

Not part of this work. Do not implement. If one seems necessary, **file it and stop** — do not fold it in.

**Declared unenforceable — never attempt to check these in code:**

1. Grammar. No parser, no part-of-speech analysis, no subject/verb detection.
2. Readability scoring. No Flesch, no syllable counting, no sentence-length modelling.
3. Jargon detection. No word lists, no acronym detection, no domain-term dictionaries.
4. "Would a stranger understand this." Not machine-decidable. It lives in prose, enforced by humans.
5. File-path or identifier detection inside caller values. No pattern that tries to spot `src/foo.ts:42` or `MSP-3`.
6. Any NLP, any heuristic, any statistical or approximate matcher.

**Deliberately not built:**

7. A word-count ceiling on any field. `PR_VALUE_CAP` (200 characters) already bounds length; a second cap doing the same job is redundant surface.
8. A legacy-trailer compatibility path in the reuse detector. See §7.
9. Extending `RESERVED_FIELD_PREFIX` to cover every enforcer token. That is the unbounded edge-case tail this SPEC exists to avoid.
10. Any change to `docs/superpowers/specs/2026-07-27-centralized-pr-creation.md`. It is a historical record. Leave it untouched.
11. Prefix-stripping inside `whatSentenceFrom`. See §5.4 — removed by decision.

**Filed, not built** — see §10.

---

## 3. Acceptance criteria — THE CEILING

This numbered list is the **complete** definition of done. Anything discovered above it is filed as a new item, never folded in. Anything below it is not done.

| # | Criterion | How it is checked |
|---|---|---|
| A1 | `node --test .claude/lib/git/tests/pr-format.test.mjs .claude/lib/git/tests/pr.test.mjs .claude/lib/git/tests/attribution-census.test.mjs` exits 0 with 0 fail | Run it; capture the exit code separately, never through a pipe |
| A2 | `node --test .claude/lib/mitosis/tests/gh-commands.test.mjs .claude/lib/mitosis/tests/e2e-ship-pr.test.mjs` exits 0 with 0 fail | Same |
| A3 | `node --test .claude/hooks/tests/block-destructive-bash.test.mjs` exits 0 with 0 fail | Same |
| A4 | The rendered body for both worked examples in §4.7 and §4.8 matches **byte for byte** | Rewritten golden test in `pr-format.test.mjs` |
| A5 | The census test in §6.4 passes, and fails when a banned token is reintroduced | Run the census; temporarily reinsert `--origin` into `pr-format.mjs`, confirm RED, revert |
| A6 | `grep -rn -- '--origin\|--provenance\|--depends\|--changed-lines' .claude/lib .claude/skills .claude/rules .claude/hooks --include='*.mjs' --include='*.md' --include='*.sh' \| grep -v '/tests/' \| grep -v '/worktrees/'` returns no lines | Run it; empty output |
| A7 | `carriesToolTrailer` does not exist outside `/tests/` and `/worktrees/` | `grep -rn carriesToolTrailer` |
| A8 | `--why "lowercase with no period"` is rejected, exit 2, message names the sentence rule | Direct invocation |
| A9 | `--why "receipt-cmd: node --test x.mjs"` is **accepted** | Direct invocation |
| A10 | `--what "test-removal: dropped a stale case"` is **rejected**, message names `--why` | Direct invocation |
| A11 | The rule doc, the `pr` skill and the bash gate describe the new flag set and contain no attribution | Diff inspection |

**Explicitly outside the ceiling:** CI green on the PR that lands this, enforcer behavior on that PR, and any pre-existing failure in an unrelated suite.

---

## 4. The new body contract

### 4.1 The skeleton

| Order | Heading (verbatim) | Source flag | Required | Rendering |
|---|---|---|---|---|
| 1 | `## What changed` | `--what` | yes | one `- ` bullet per value, max 3 |
| 2 | `## Why` | `--why` | yes | one bare line per value, no bullet, max 3 |
| 3 | `## Risk` | `--risk` | **no** | one bare line |
| 4 | `## Verification` | `--verified` / `--not-verified` | at least one combined | `Verified: <v>` lines first, then `Not verified: <v>` lines |
| 5 | `## Links` | `--supersedes`, `--link` | no | `Supersedes <url>` first if present, then one `- ` bullet per `--link` |

Separator between blocks: exactly `\n\n`. Within a block: exactly `\n`. No trailing content of any kind after the last block. An absent optional section is omitted entirely, never rendered as an empty heading.

**This means** the body ends with the last populated section's last line. It does **not** mean a trailing newline is appended — `renderPrCreateBody` returns `blocks.join('\n\n')` and nothing else.

**Rationale for the order:** it is the owner's stated reading path — what was done, why, the risks, then go read the diff. Verification is evidence and sits terminal, matching the reference repository's convention (36 of 38 merged PRs there place verification last).

**`## Risk` stays optional.** Decided by the owner. A required risk field invites `N/A` filler, which the rules already forbid and the tool cannot detect.

**No lede is added. Rejected.**

| Option | Verdict | Reason |
|---|---|---|
| No lede; `## What changed` is the first section | **CHOSEN** | Pure subtraction. The PR title already is a one-sentence "what", it is what GitHub surfaces in list views and search, and it becomes the squash-commit subject. The body's first two lines are the what, so G1 is satisfied literally. |
| New required `--summary` flag as an un-headed opening paragraph | rejected | A new required field on every caller, against the subtraction bias. It would duplicate the title in practice. |
| Collapse `--what` to a single un-headed prose lede | rejected | Loses the ability to state a change with two or three distinct behavioral effects, and the owner asked for "more structured". |

**Counter-evidence and mitigation:** with several bullets and no framing sentence a reviewer could face an unframed list. Mitigation: `PR_MULTI_LIMITS['--what']` drops from **5 to 3** — a subtraction that directly serves "concise" — and the writing rules in §8 require one behavioral effect per bullet.

### 4.2 The reuse detector

`carriesToolTrailer` is deleted. Its replacement:

```js
const REQUIRED_HEADINGS = Object.freeze([WHAT_HEADING, WHY_HEADING, VERIFICATION_HEADING]);

export function carriesComposedSkeleton(body) {
  if (typeof body !== 'string') return false;
  const lines = body.split(LINE_SEPARATOR);
  if (lines[0] !== WHAT_HEADING) return false;
  return REQUIRED_HEADINGS.every((heading) => lines.includes(heading));
}
```

| Property | Value |
|---|---|
| Input | any value |
| Non-string input | returns `false` |
| Returns | strict `true` or `false`, always |
| Names a tool or agent | no |
| Check performed | four exact string comparisons over an array of lines |
| Regex used | none |
| Body edited on GitHub afterward | `true` if the three headings survive and `## What changed` is still line 1; `false` otherwise |

**Why these three headings and no others:** they are the only sections structurally guaranteed to exist. `--what` is required, `--why` is required, and at least one of `--verified`/`--not-verified` is required. `## Risk` and `## Links` are optional and must not be checked.

**Why a caller cannot forge it:** `inertValue`'s `BLOCK_OPENER` at `pr-format.mjs:20` rejects **any** caller value beginning with `#`. A caller therefore cannot emit a `##` line. The document skeleton is a function of the flag set alone.

**Behavior on a human-edited body is deliberate, not a bug:** it returns `false`, the tool reports `{"action":"reused-unverified"}` on stdout and exits 0, and the engine parks the unit. That is exactly today's behavior for a hand-written PR. It fails safe.

**Rejected:** hashing or checksumming the body. Any edit on GitHub would break it, converting every human touch-up into a parked unit, and it adds a stored-state problem the current design does not have.

### 4.3 `--origin` and `--provenance`

**Both DELETED.** `--origin` existed only to select which of three trailer sentences was printed. With the trailers gone it selects nothing. `PR_ORIGINS` and `PR_PROVENANCE_PATTERN` go with them.

| Consequence | Detail |
|---|---|
| A caller still passing `--origin` | Rejected by the existing unknown-flag check at `pr.mjs:103`, exit 2. **No new guard is written.** |
| The ~34 coupled test cases | Deleted, not modified. They assert removed behavior. |
| Production callers | `node-commands.mjs` (two argv templates), `ship-plan.mjs` (`provenanceOf`, `PR_AGENT_LABEL`, `PR_MODEL_UNSPECIFIED`), `gh-site-fixtures.mjs` (anchors, argvs, placeholders). |
| `git-command-separation.mjs`, `supersede-summary.mjs` | Unaffected by attribution removal — verified: they import only `PR_TITLE_CAP`, `PR_VALUE_CAP` and `inertValue`. |

**Rejected:** keeping `--origin` as an accepted no-op for caller compatibility. It leaves a live path whose only purpose was attribution, and a loud rejection beats a silent no-op.

### 4.4 The sentence-structure rule

**The rule, in full. Nothing beyond this is enforced in code.**

> A `--why`, `--what` or `--risk` value must begin with an uppercase ASCII letter (`A`–`Z`) and end with `.`, `?` or `!`.
> A `--why` or `--risk` value is **exempt** when it begins with one of the five receipts line tokens.
> A `--what` value is **never** exempt.

Everything else about language is a non-goal (§2).

```js
export const RECEIPT_LINE_TOKENS = Object.freeze([
  'work-type:',
  'test-removal:',
  'receipt:',
  'receipt-cmd:',
  'receipt-lock:',
]);

const SENTENCE_TERMINATORS = '.?!';

export function isSentenceShaped(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const first = value.charAt(0);
  if (first < 'A' || first > 'Z') return false;
  return SENTENCE_TERMINATORS.includes(value.charAt(value.length - 1));
}

export function carriesReceiptLineToken(value) {
  if (typeof value !== 'string') return false;
  return RECEIPT_LINE_TOKENS.some((token) => value.startsWith(token));
}
```

Field coverage:

| Field | Sentence rule | Reason |
|---|---|---|
| `--what` | **yes**, no exemption | Prose. It is the lead section. |
| `--why` | **yes**, receipts-token exempt | Prose, renders as a bare line, so it is the enforcer's only channel. |
| `--risk` | **yes**, receipts-token exempt | Prose, renders as a bare line. |
| `--verified`, `--not-verified` | **no** | These are `<check> - <result>` pairs. They are not sentences and must not be forced into sentence shape. |
| `--link` | **no** | A URL or a GitHub closing keyword such as `closes acme/widgets#12`. |
| `--title` | **no** | It has its own grammar: `PR_TITLE_PATTERN` requires a lowercase initial and no trailing period. Applying the sentence rule would make every title unsatisfiable. |
| `--supersedes`, `--repo`, `--head`, `--base` | **no** | Structured tokens, not prose. |

**Violation is a REJECTION**, exit 2, consistent with every other field rule. Message text:

```
mitosis-git pr-create: a --why value must begin with an uppercase letter and end with . ? or !, so the body reads as sentences; received "<value>"
```

and for the `--what` receipts case specifically:

```
mitosis-git pr-create: a --what value may not begin with a receipts line token; a bulleted line cannot satisfy the enforcer's line-start grammar. Pass it as --why instead.
```

**Why the receipts exemption exists — load-bearing, do not remove.** The enforcer requires tokens such as `receipt-cmd:` at the **start of a line**. `--why` and `--risk` values render as bare lines; `--what` values are prefixed with `- `. Without the exemption the sentence rule would make it impossible to emit an enforcer token through this tool at all, silently breaking CI compliance. The exemption is a closed list of five externally-owned strings — a membership test, not a heuristic.

**Why the `--what` rejection exists:** merged PR #249 passed a `test-removal:` acknowledgment as `--what`; it rendered as `- test-removal: ...` and gate G11 never registered it. The rejection converts that silent failure into a loud one naming the correct flag.

**The three downgrade tags (`unverified-reasoned`, `speculative`, `reverted`) are deliberately NOT in `RECEIPT_LINE_TOKENS`.** Any occurrence anywhere in the body short-circuits all eight re-run gates. They get no blessed channel.

**Free side effect, not claimed as a fix:** a `- [x]` checkbox value passed to `--why`, `--what` or `--risk` now fails the uppercase-initial check. It is still accepted by `--verified`. The checkbox question stays filed (F4).

**Rejected alternatives:**

| Option | Reason rejected |
|---|---|
| A dedicated `--receipt` flag with its own `## Receipts` section | An addition, against the subtraction bias, and it puts a jargon section in the body permanently. |
| Exempt `--why` from the rule entirely | Leaves the primary prose field unenforced — the field G2 most cares about. |
| Put the rule only in prose, enforce nothing | G2 says enforce sentence structure. Prose alone is not enforcement. |
| Add a word-count ceiling | Redundant with the existing 200-character cap. |

### 4.5 The `SIZE:` warning and `DEPENDS-ON`

| Element | Verdict | Reason |
|---|---|---|
| `--changed-lines`, `PR_CHANGED_LINES_PATTERN`, `PR_SIZE_WARNING_THRESHOLD`, `sizeWarning()`, the `SIZE:` line, and `size` in `RESERVED_FIELD_PREFIX` | **DELETE** | The number is caller-supplied. The warning tells the author a figure the author just computed and passed in — zero information. For the reviewer it is jargon, and the Files Changed tab already shows diff size. |
| `--depends`, `DEPENDS_PREFIX`, `DEPENDS-ON` in `RESERVED_STRUCTURE_PREFIX`, `parseDependsList`, `DEPENDS_ID_PATTERN`, `DEPENDS_CAP`, `DEPENDS_ID_CAP` | **DELETE** | Internal MSP ids are exactly the internal record identifiers G2 forbids, and they are meaningless to a reviewer. Verified: nothing reads `DEPENDS-ON` back out of a body, a commit message or any stored text — every occurrence is write-side, test-side or documentation prose. The owner confirmed no external consumer. |
| `SUPERSEDES ` → `Supersedes ` | **RESHAPE** | A PR URL is human-meaningful and belongs in the body. Only the shouty casing is jargon. `RESERVED_STRUCTURE_PREFIX` becomes `/^Supersedes /`, preserving the anti-forgery property. Verified: no read-side consumer exists — `supersede-summary.mjs`, despite its name, parses `git diff --numstat`, never a PR body. |

**Rejected:** relocating the size warning to stderr. It keeps three constants, a parser and a code path alive to deliver a zero-information message to the one person who already knows it.

### 4.6 The rendered skeleton, literally

```
## What changed
- <what value 1>
- <what value 2>

## Why
<why value 1>
<why value 2>

## Risk
<risk value>

## Verification
Verified: <verified value 1>
Not verified: <not-verified value 1>

## Links
Supersedes <canonical pr url>
- <link value 1>
```

### 4.7 Worked example A — minimal

Command:

```
node ~/.claude/lib/git/pr.mjs pr-create \
  --repo acme/widgets --head docs/pr-rule-pointer --base main \
  --title "docs(rules): point the PR rule at the central tool" \
  --what "The pull-request rule now points at the central tool instead of an ad-hoc command." \
  --why "The rule still described a workflow the gate denies, so it sent people down a path that fails." \
  --not-verified "no automated check covers rule prose - not run"
```

Body, byte for byte:

```
## What changed
- The pull-request rule now points at the central tool instead of an ad-hoc command.

## Why
The rule still described a workflow the gate denies, so it sent people down a path that fails.

## Verification
Not verified: no automated check covers rule prose - not run
```

### 4.8 Worked example B — every optional section

Command:

```
node ~/.claude/lib/git/pr.mjs pr-create \
  --repo acme/widgets --head refactor/pr-body --base main \
  --title "refactor(pr-tool): compose pr bodies from declared fields" \
  --what "Pull-request descriptions are now built from declared fields instead of written by hand." \
  --what "The description opens with the change itself, so a reviewer reads what happened first." \
  --why "Every path that opened a pull request invented its own format, so no two descriptions could be read the same way." \
  --why "receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs" \
  --risk "A pull request opened before this change no longer matches the expected shape and is reported as unverified." \
  --verified "node --test .claude/lib/git/tests/pr-format.test.mjs - 71 pass, 0 fail" \
  --not-verified "the enforcer on the fresh branch - not run; it starts after this opens" \
  --supersedes "https://github.com/acme/widgets/pull/41" \
  --link "closes acme/widgets#12"
```

Body, byte for byte:

```
## What changed
- Pull-request descriptions are now built from declared fields instead of written by hand.
- The description opens with the change itself, so a reviewer reads what happened first.

## Why
Every path that opened a pull request invented its own format, so no two descriptions could be read the same way.
receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs

## Risk
A pull request opened before this change no longer matches the expected shape and is reported as unverified.

## Verification
Verified: node --test .claude/lib/git/tests/pr-format.test.mjs - 71 pass, 0 fail
Not verified: the enforcer on the fresh branch - not run; it starts after this opens

## Links
Supersedes https://github.com/acme/widgets/pull/41
- closes acme/widgets#12
```

The second `--why` value is receipts-token exempt, so it bypasses the sentence rule and lands at line start where the enforcer can read it.

---

## 5. Change inventory

In dependency order. Do these as separate commits.

### 5.1 `.claude/lib/git/pr-format.mjs` — MODIFY (the bulk)

**DELETE**

| Symbol | Line |
|---|---|
| `PR_ORIGINS` | 5 |
| `PR_PROVENANCE_PATTERN` | 6 |
| `PR_CHANGED_LINES_PATTERN` | 7 |
| `PR_SIZE_WARNING_THRESHOLD` | 8 |
| `PROVENANCE_HEADING` | 29 |
| `DEPENDS_PREFIX` | 39 |
| `MACHINE_TRAILER`, `HUMAN_TRAILER`, `UNATTRIBUTED_TRAILER`, `TRAILER_BY_ORIGIN` | 41–44 |
| `carriesToolTrailer` | 46–50 |
| `sizeWarning` | 81–84 |
| the depends branch of `linkLines` | 98 |
| the provenance, size-warning and trailer blocks of `renderPrCreateBody` | 111–112, 117–119 |

**MODIFY**

| Line | From | To |
|---|---|---|
| 12 | `'--what': 5,` | `'--what': 3,` |
| 22 | `/^(verified\|not verified\|size):/i` | `/^(verified\|not verified):/i` |
| 23 | `/^(SUPERSEDES\|DEPENDS-ON) /` | `/^Supersedes /` |
| 26–31 | heading constants | `WHAT_HEADING = '## What changed'`; `WHY_HEADING`, `VERIFICATION_HEADING`, `RISK_HEADING`, `LINKS_HEADING` keep their current text |
| 38 | `'SUPERSEDES '` | `'Supersedes '` |
| 102–120 | `renderPrCreateBody` block order | what → why → risk → verification → links, then `return blocks.join(SECTION_SEPARATOR)` |

**ADD:** `REQUIRED_HEADINGS`, `carriesComposedSkeleton`, `RECEIPT_LINE_TOKENS`, `SENTENCE_TERMINATORS`, `isSentenceShaped`, `carriesReceiptLineToken` — exactly as written in §4.2 and §4.4.

### 5.2 `.claude/lib/git/pr.mjs` — MODIFY

**DELETE:** `parseDependsList` (76–82), `DEPENDS_ID_PATTERN`/`DEPENDS_CAP`/`DEPENDS_ID_CAP` (64–66), the origin check in `readPrCreateTarget` (158–162), the whole provenance half of `readPrCreateAttribution` (179–191), the `depends` and `changedLines` blocks of `readPrCreateReferences` (207–220).

**MODIFY:**

- `FLAG_SPEC['pr-create']` at 39–41 becomes:
  ```js
  required: Object.freeze(['--repo', '--head', '--base', '--title', '--why', '--what']),
  single: Object.freeze(['--repo', '--head', '--base', '--title', '--risk', '--supersedes']),
  multiple: Object.freeze(['--why', '--what', '--verified', '--not-verified', '--link']),
  ```
- Rename `readPrCreateAttribution` → `readPrCreateRisk(single)`; it takes no `origin` argument and returns `{ risk }`.
- `collectInertList(multiple, flag)` gains the sentence check after `inertValue` succeeds. Apply it only when `flag` is `'--why'` or `'--what'`, per §4.4.
- `readPrCreateRisk` applies the same check to `--risk`.
- `readPrEntry` at 379: `carriesToolTrailer(entry.body)` → `carriesComposedSkeleton(entry.body)`. Rename the field `toolComposed` → `composedHere` and update its two read sites (426, and the message at 427).
- Replace the `reused-unverified` message at 427 with:
  ```
  mitosis-git pr-create: the open pull request already on this head (<url>) does not carry the composed section skeleton, so this tool composed neither its title nor its body; reporting it as reused-unverified rather than asserting the mandated format. A human closes it and reopens it through this tool, or confirms it as it stands.
  ```
- Update the import block at 9–23 to drop deleted symbols and add the new ones.

### 5.3 `.claude/lib/mitosis/node-commands.mjs` — MODIFY

- Import block at 3–12: drop `PR_CHANGED_LINES_PATTERN`, `PR_ORIGINS`, `PR_PROVENANCE_PATTERN`. Keep `PR_TITLE_CAP`, `PR_TITLE_PATTERN`, `PR_VALUE_CAP`, `SUPERSEDES_PREFIX`, `inertValue`.
- Delete `PR_ORIGIN_MACHINE` and the `prProvenance`, `depends` and `changedLines` token helpers.
- `SUPERSEDE['open-pr']` (164–181): remove the `'--origin', PR_ORIGIN_MACHINE,` and `'--provenance', t.prProvenance(...)` pairs.
- `SHIP['open-pr']` (183–205): remove the same two pairs, plus the `depends` and `changedLines` locals and their two spread expressions.
- Update the agent-prompt template literals so the command they instruct an agent to run matches the new flag set, and add the writing rule from §8.3.

### 5.4 `.claude/lib/mitosis/ship-plan.mjs` — MODIFY

- Import at 16: drop `PR_CHANGED_LINES_PATTERN` and `PR_PROVENANCE_PATTERN`.
- Delete `PR_AGENT_LABEL` and `PR_MODEL_UNSPECIFIED` (27–28) and `provenanceOf` (179–183).
- Delete `dependsIds()` and `changedLinesValue()`.
- `prCreateValues` (205–220): drop the `provenance`, `dependsIds` and `changedLines` keys; change `what: facts.what` to `what: whatSentenceFrom(facts.what)`.
- `composePrCreateArgv` (222–240) loses its second parameter; update its sole caller at `:395`.
- Keep `RECEIPTS_NOT_VERIFIED = 'receipts enforcer - not run'` and `BOUNDARY_VERIFIED = 'boundary gate - clean'` unchanged — they are verification pairs, exempt from the sentence rule.

**ADD** to `ship-plan.mjs`:

```js
function whatSentenceFrom(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${MODULE}: the pull-request what value must be a non-empty string, received ${describe(value)}`);
  }
  const capitalised = value.charAt(0).toUpperCase() + value.slice(1);
  const last = capitalised.charAt(capitalised.length - 1);
  return '.?!'.includes(last) ? capitalised : `${capitalised}.`;
}
```

**Prefix-stripping was removed by owner decision.** An earlier draft stripped a Conventional-Commits prefix at the first colon, guarded by matching one of eight type words. That guard is a heuristic and could truncate a legitimate sentence containing a colon, which §2 forbids. The function now only capitalises the first character and appends a full stop when one is absent.

This is also very likely the correct behavior on its own terms: `--title` is composed at `ship-plan.mjs:170-176` as `${changeType}(${scope}): ${title}`, so `msp.title` carries the bare summary and has no prefix to strip. If a prefix ever does appear it is left in place; the visible awkwardness is a deliberate nudge toward the real fix, filed as F6.

No `PR_TITLE_TYPES` import is needed.

### 5.5 `.claude/lib/mitosis/supersede-summary.mjs` — MODIFY

`composeSupersedeSummary` (96–117) currently emits a `--what` value shaped like `N files changed, +A/-D since the superseded head: <paths>`. Under the new rules it starts with a digit (rejected by the sentence rule) and carries file paths (forbidden by G2). Reshape to:

```
This branch changes N files since the superseded head, adding A lines and removing D lines.
```

Drop the path list entirely. `parseNumstat` (49–77) is unchanged. The `inertValue` calls at 89, 108 and 112 stay.

### 5.6 `.claude/lib/mitosis/gh-site-fixtures.mjs` — MODIFY

- Delete `OMITTED_DEPENDS` (258–260) and every reference.
- Supersede fixture (263–298): remove `--origin`/`--provenance` from `anchor` and `argv`, remove the provenance placeholder.
- Ship fixture (299–338): remove `--origin`/`--provenance`/`--changed-lines`/the depends flag from `anchor` and `argv`, remove the matching placeholders.
- Keep `DERIVED_SHIP_VERIFIED`. Its consumer is `.claude/lib/mitosis/transcription-conversions.mjs:35`.

### 5.7 `.claude/hooks/block-destructive-bash.sh` — MODIFY (line 135)

The deny message is pinned **byte for byte** by `.claude/hooks/tests/block-destructive-bash.test.mjs:50`. Change both, in the same commit, to exactly:

```
opening a pull request is centralized: every pull request in this environment is created by one tool, in one format, and its title and body may not be rewritten afterwards. Run this, quoting every value: node "$HOME"/.claude/lib/git/pr.mjs pr-create --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH --title TYPE(SCOPE): LOWERCASE IMPERATIVE SUMMARY --what THE BEHAVIOR THAT IS DIFFERENT NOW. --why THE PROBLEM THAT EXISTED BEFORE. --not-verified THING YOU DID NOT CHECK - not run. Types: feat fix refactor docs test chore perf ci; title max 72 characters, no trailing period. A --why, --what or --risk value starts with a capital letter and ends with a full stop. NEVER write a --verified line for a check you did not run. Pass every value as ONE inert argv value: never a file path, never an at-prefixed value, never a shell redirection, never a gh api field whose value starts with an at-sign. A pull/new URL printed by git push is not an approved path either. Full field set and caps: .claude/rules/common/git/pull-requests.md
```

### 5.8 Prose surfaces — MODIFY

`.claude/rules/common/git/pull-requests.md` and `.claude/skills/pr/SKILL.md`. Content in §8.

### 5.9 `.claude/lib/git/tests/attribution-census.test.mjs` — ADD

Specified in §6.4.

---

## 6. Test plan

### 6.1 Rewritten, not deleted

`pr-format.test.mjs:150–175` — the byte-for-byte golden body test. **Rewrite it, do not delete it.** It is the single assertion pinning all headings, their order, bullet prefixes, blank-line separation and the absence of trailing content. Replace the existing golden pair with worked example B (§4.8) verbatim, and add a second golden pair for worked example A (§4.7).

### 6.2 Deleted — they assert removed behavior

| Group | Approx. count | Locations |
|---|---|---|
| Provenance and origin contract | ~34 | across `pr.test.mjs` and `pr-format.test.mjs` |
| Trailer text | 13 | `pr-format.test.mjs:168, 171, 220, 234, 240–241, 299, 315–317`; `pr.test.mjs:559, 621, 806, 809–819` |
| `--depends` / `DEPENDS-ON` | — | `pr-format.test.mjs:102, 164, 246, 264`; `pr.test.mjs:9, 319, 587, 589, 612, 619, 824` |
| `--changed-lines` / `SIZE:` | — | wherever they appear in both files |

Named specifically for deletion: `'the machine trailer differs from the human one...'` at `pr-format.test.mjs:237`, and `'the composed body carries the real bracketed model id...'` at `:179`.

### 6.3 Modified

- `'the renderer omits every absent optional section entirely'` (`:212`) — drop `## Provenance` and `SIZE:` from the absent list, update heading assertions, drop the trailer assertion.
- `'the renderer emits every section in the fixed order'` (`:223`) — new order array: `['## What changed', '## Why', '## Risk', '## Verification', 'Verified: ', 'Not verified: ', '## Links']`. Replace the trailer assertion with one that the body's last line belongs to the last populated section.
- `'a caller value can never begin a line the tool owns'` (`:244`) — the owned-prefix regex becomes `/^(Verified: |Not verified: |Supersedes )/`.
- Every fixture argv in both files loses `--origin`, `--provenance`, `--depends`, `--changed-lines`, and gains sentence-shaped `--why`/`--what` values.
- `.claude/lib/mitosis/tests/gh-commands.test.mjs` and `e2e-ship-pr.test.mjs` — update expected argvs. `e2e-ship-pr.test.mjs:156` observes the parked state; keep that observation, it is still correct.

### 6.4 Added

**New behavior cases** in `pr.test.mjs`:

| Case | Expectation |
|---|---|
| `--why "lowercase no period"` | exit 2, message names the sentence rule |
| `--why "Uppercase with a period."` | accepted |
| `--why "Uppercase with no period"` | exit 2 |
| `--why "receipt-cmd: node --test x.mjs"` | accepted, renders at line start |
| `--risk "work-type: chore"` | accepted |
| `--what "test-removal: dropped a stale case"` | exit 2, message names `--why` |
| `--what "lowercase bullet."` | exit 2 |
| `--origin machine` | exit 2, `unknown flag "--origin"` |
| `--provenance "agent=x model=y"` | exit 2, `unknown flag "--provenance"` |
| `--depends "a,b"` | exit 2, unknown flag |
| `--changed-lines 512` | exit 2, unknown flag |
| four `--what` values | exit 2, ceiling of 3 |

**New reuse-detector cases** in `pr-format.test.mjs`:

| Input | `carriesComposedSkeleton` |
|---|---|
| a body rendered by `renderPrCreateBody` | `true` |
| the same body with `## Why` deleted | `false` |
| the same body with a paragraph prepended above `## What changed` | `false` |
| a hand-written body with no headings | `false` |
| `null`, `undefined`, `42`, `{}`, `[]` | `false` for each |
| a body carrying the old trailer sentence | `false` |

**Also add** a `whatSentenceFrom` case asserting that a value containing a colon is not truncated: `"Test the colon: it survives."` returns unchanged.

**The source census test** — `.claude/lib/git/tests/attribution-census.test.mjs`. This is what makes attribution removal permanent.

```js
const ROOTS = Object.freeze([
  '.claude/lib/git',
  '.claude/lib/mitosis',
]);

const EXTRA_FILES = Object.freeze([
  '.claude/hooks/block-destructive-bash.sh',
  '.claude/skills/pr/SKILL.md',
  '.claude/rules/common/git/pull-requests.md',
]);

const BANNED = Object.freeze([
  'provenance',
  'agent=',
  'model=',
  '--origin',
  'opened by an automated agent',
  'opened at human direction',
]);
```

Exact assertion: recursively glob every `*.mjs` under each entry of `ROOTS`, **excluding any path containing `/tests/` or `/worktrees/`**, append `EXTRA_FILES`, read each as UTF-8, lowercase it, and assert that no entry of `BANNED` (lowercased) appears as a substring. On failure the message must name the file, the token and the 1-based line number of the first occurrence.

Three properties it must have:

1. **Closed census, not an allowlist.** The file list is derived by globbing, so a newly added file under either root is automatically covered. No pinned file count, no sampled allowlist — both are change-detectors wearing a census costume.
2. **Halts on the unclassifiable.** There is no suppression mechanism. If the census fires on a use of `provenance` or `model=` genuinely unrelated to PR attribution, **stop and report it as an open question. Do not add an exception** — that converts the census into an allowlist and destroys its value.
3. **Two principled exclusions.** `/tests/` is excluded because a test asserting `--origin` is now rejected must be able to name the flag. `/worktrees/` is excluded because `.claude/worktrees/` holds roughly 30 sibling checkouts duplicating these files verbatim, which are not this repository's working tree.

`HUMAN-GATED` is deliberately **not** banned. It states that a human gates the merge — not AI attribution — and it appears legitimately in the unrelated merge-deny message. Banning it would produce exactly the false-positive tail this SPEC forbids.

**Known stall risk:** the census bans the substring `provenance` across all of `.claude/lib/mitosis/`. If an unrelated use exists, A5 is unachievable as written. Per property 2, stop and raise it rather than adding an exception.

---

## 7. Migration and compatibility

**PRs already open carrying the old trailer.** `carriesComposedSkeleton` returns `false` for them: their first line is `## Why`, not `## What changed`. The tool prints `{"action":"reused-unverified","url":...,"number":...}` on stdout, writes the explanatory message on stderr, and **exits 0**. Downstream, `ship-plan.mjs:35–36` maps `reused-unverified` to `state:'parked'` rather than shipped.

**This is accepted, not mitigated.** It is the same conservative outcome the tool already produces for any hand-written PR. A human either confirms the existing PR as it stands, or closes it and reopens it through the tool. No exit code changes; nothing fails.

**Rejected: a legacy-trailer fallback in the detector.** It would reintroduce the exact attribution strings being deleted, permanently, into the code — the direct opposite of G3 — and it would fail the census test. Hard no.

**Callers not yet updated** fail loudly at parse time with `unknown flag`, exit 2, before any `gh` call is made. Nothing is created in a wrong format.

**No stored state, no on-disk format changes.** Nothing needs a data migration.

---

## 8. The unenforceable rules, and where each lives

Code enforces typographic form only. Everything about clarity lives in prose, at three surfaces in ascending order of leverage.

### 8.1 `.claude/rules/common/git/pull-requests.md` — the standard

Replace the flag table and usage block with the new flag set (§4.1), and add one subsection. **These six rules are the complete list. Do not add a seventh.**

> ### Writing the body
>
> 1. Write for a reviewer who has never seen this code. Define any term you must use, the first time you use it.
> 2. One idea per value. Prefer a plain word to a precise but opaque one.
> 3. Do not name files, line numbers, or internal record, task or unit identifiers. The Files Changed tab already lists the files.
> 4. `--why` states the problem that existed **before** this change, never the change itself.
> 5. `--what` states the behavior that is **different now**, as a full sentence, one behavioral effect per value.
> 6. `--verified` and `--not-verified` are `<check> - <result>`. The result is a number or a state, never an adjective.

Also update: the body-fields table (remove the Provenance row, reorder to What changed / Why / Risk / Verification / Links), leave the title grammar unchanged, and delete the paragraph beginning "`--provenance` is required when `--origin machine`".

### 8.2 `.claude/skills/pr/SKILL.md` — the agent-facing standard

Replace lines 10–20 with:

    ```
    node ~/.claude/lib/git/pr.mjs pr-create \
      --repo OWNER/REPO --head HEAD-BRANCH --base BASE-BRANCH \
      --title "type(scope): lowercase imperative summary" \
      --what "The behavior that is different now." \
      --why "The problem that existed before this change." \
      --not-verified "thing you did not check - not run"
    ```

    A `--why`, `--what` or `--risk` value starts with a capital letter and ends with a full stop. Write for a reviewer who has never seen this code: no file names, no line numbers, no internal ids — the Files Changed tab already lists the files. `--why` is the problem that existed before; `--what` is the behavior that is different now. Never write a `--verified` line for a check you did not actually run. A `pull/new/<branch>` URL printed by `git push` is not an approved path either.

### 8.3 `.claude/lib/mitosis/node-commands.mjs` — the highest-leverage surface

This module holds the template literals that become the agent prompt at both PR-opening sites; `gh-site-fixtures.mjs` only pins them. Where the prompt instructs the agent to substitute a summary placeholder, prepend one sentence:

> Write each `--what` and `--why` value as a full sentence a reviewer who has never seen this code would understand: start with a capital letter, end with a full stop, and name no file, line number or internal id.

Then update `gh-site-fixtures.mjs`'s `anchor` strings so the fixture census still matches.

---

## 9. Reversals acknowledged

| Reversed | What it said | Why the reversal is coherent |
|---|---|---|
| Decision `0597`, ratified **2026-08-18** | Widened the provenance character set on the premise that the field's purpose is to record the model verbatim, and that failing to do so is a correctness defect | The premise is sound *conditional on the field existing*. Deleting the field makes its accuracy moot: nothing remains whose fidelity can be defective. Recorded as decision `0631`. |
| Spec `2026-07-27-centralized-pr-creation.md:771` | Ratified the trailer as the reuse-detection key | The reuse key was never about attribution; the trailer merely happened to be a tool-owned string at a known position. The section skeleton is a tool-owned string at a known position with the same anti-forgery guarantee and no attribution. The function is preserved; only the carrier changes. |
| Spec `2026-07-27-centralized-pr-creation.md:323` | Ratified `--origin` as the trailer-wording selector, and stated explicitly it is **not** an authentication claim | The clause's own reasoning retires it: a field that authenticates nothing and now selects nothing has no remaining function. |
| Decision `0243` | Removed "mitosis" from the tool path for being misleading | This SPEC **completes** that decision rather than reversing it — the trailer still printed "mitosis-git pr-create tool" after `0243` removed the name from the path. |

Nothing ratifies Why-before-What ordering: no rationale exists for it in the spec or in 628 decision records. Reordering reverses nothing.

---

## 10. Out of scope — filed as new items

Each is a separate future unit of work. Do not do any of them here.

| # | Item | Reason it is filed |
|---|---|---|
| F1 | No CI boundary validator that checks a PR body's shape at the pull request | `carriesComposedSkeleton` is a pure exported function designed to be that validator's core when it is picked up, but wiring it needs a workflow file, a runner and a policy for pre-existing PRs. That is a second deployment surface, not part of composing a body. |
| F2 | `gh api` / GraphQL creation paths have no `permissions.deny` backstop, and the hook fails open on a 5-second timeout | A different subsystem with no dependency on body shape. It does not get worse from this change. |
| F3 | Prose↔code drift beyond what this change touches: the undocumented `pr-close` and `compare` verbs, three inconsistent path spellings, and unenforced rules unrelated to the body | The drift this change *creates* is fixed here (§5.7, §5.8) and is not optional. The pre-existing remainder is independent. |
| F4 | `- [x]` checkbox values pass `inertValue` and render as a visual verification claim | An `inertValue` hardening question, orthogonal to body shape and attribution. The sentence rule incidentally blocks it on `--why`/`--what`/`--risk`; it remains open on `--verified`. |
| F5 | Enforcer line-grammar tokens can still reach a non-line-start position through `--link` and `--verified` | Closing every such position is the unbounded edge-case tail this SPEC forbids. The two live paths work, and the one observed failure (`--what`) is now a loud rejection. |
| F6 | Give the MSP data model a `summary` field distinct from `title` | The verbatim-title duplication is only partly addressed here by `whatSentenceFrom`. A truly distinct summary requires a decomposer data-model change that ripples well outside this composer. |
| F7 | ~30 sibling checkouts under `.claude/worktrees/` carry stale copies of `pr-format.mjs` and `pr.mjs` | Worktree hygiene, unrelated to the composer. The census excludes them by design. |

---

## 11. Risks

| Risk | What makes it real | Mitigation |
|---|---|---|
| **In-flight PRs park.** Every currently open tool-composed PR stops matching the detector and the engine parks its unit. | Any unit is mid-ship when this lands. | Land this when no unit is mid-ship, or accept the parks — exit code stays 0, a human confirms or reopens. Do **not** add a legacy fallback (§7). |
| **The census fires on a legitimate use** of `provenance` or `model=` in `.claude/lib/mitosis/` for a non-PR reason. | Such a use exists and was not surfaced by the sweep. | **Stop and report it as an open question.** Do not add an exception — that converts the census into an allowlist. |
| **The receipts exemption is dropped as "unnecessary"** by a later simplification pass. | A reviewer reads it as redundant with `inertValue`. | §4.4 states it is load-bearing and why. The test cases for `--why "receipt-cmd: ..."` and `--what "test-removal: ..."` pin both halves. |
| **The hook prose and its byte-pinned test drift apart.** | Only one of `block-destructive-bash.sh:135` and `block-destructive-bash.test.mjs:50` is edited. | A3 catches it immediately. Edit both in the same commit. |

---

## 12. Questions resolved before execution

| # | Question | Resolution |
|---|---|---|
| 1 | Does the `0597` reversal need its own record? | **Yes, and it exists.** Decision `0631`, `remove-all-attribution-from-pr-bodies`. |
| 2 | Should `## Risk` become required? | **No, keep optional.** A required field invites `N/A` filler the tool cannot detect. |
| 3 | Does any external consumer read `SUPERSEDES ` or `DEPENDS-ON ` from a PR body? | **No.** Delete `DEPENDS-ON` entirely; reshape `SUPERSEDES ` to `Supersedes `. |
| 4 | Should `whatSentenceFrom` strip a Conventional-Commits prefix at the first colon? | **No.** The guard is a heuristic that could truncate a legitimate sentence. Capitalise and append a full stop only. |

No open questions remain. Execute as written.
