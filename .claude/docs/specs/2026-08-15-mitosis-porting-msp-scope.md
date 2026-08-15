# The porting MSP (CP): scope, obligation inventory, and recovery record

Status: proposed
Date: 2026-08-15
Authority: decision 0424, "An incremental porting MSP is inserted before C7 to drain its accumulated obligations"
Parent SPEC: `.claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md`

The name `CP` is provisional. It denotes the unit 0424 inserts immediately before C7 and is not part of 0374's lettered decomposition.

## 1. Why this unit exists

C7 is SPEC-named as oversized and unsplittable because the tick loop is one unit. It has since accumulated far more than the tick loop. Decision 0424 inserts CP immediately before C7 to drain everything that is not the tick loop, so C7's SPEC-named exemption from the review-size target covers the tick loop alone rather than acting as a catch-all for everything deferred upstream of it.

CP is the drain. C7 is the loop.

## 2. Where the obligations live now: the recovery finding

Five arrays named C7's inherited work. Three of them no longer exist in the tree.

| Cluster | Symbol | Status in the tree | Recover from |
|---|---|---|---|
| Journal (C3) | `JOURNAL_C7_OBLIGATIONS` | live, `.claude/lib/mitosis/journal-store.mjs:21-29` | n/a |
| Coupling (C5) | `COUPLING_OBLIGATIONS` | live, `.claude/lib/mitosis/coupling-review.mjs:35-42` | n/a |
| Prompt (C2) | `PROMPT_C7_OBLIGATIONS` | deleted by `2087dd51` | `git show 3bbd8fb4:.claude/lib/mitosis/prompt-registry.mjs` |
| Transcription (C4) | `TRANSCRIPTION_C7_OBLIGATIONS` | deleted by `2087dd51` | `git show 3bbd8fb4:.claude/lib/mitosis/transcription-census.mjs` |
| Boundary (C6) | `BOUNDARY_C7_OBLIGATIONS` | deleted by `82a8d2fe` | `git show f0ab1c24:.claude/lib/mitosis/boundary-census.mjs` |

`2087dd51` is "chore(gate): retire the census verbs and the apparatus they read". `82a8d2fe` is "chore(gate): retire the boundary-parity verb and its census apparatus", the tip of `feat/c6-boundary-program`.

Seventeen obligations were removed as collateral. Their host modules were census apparatus, retired under decision 0439 when `receipts/gates@1.1` replaced the bespoke census verbs. The obligations themselves were never discharged and were never re-homed. `git grep PROMPT_C7_OBLIGATIONS` against the current tree returns nothing.

Section 3 reproduces all seventeen verbatim so the record does not depend on a reader knowing which commit to resurrect.

## 3. The inventory

Twenty-six obligations. Text is quoted verbatim from the commit named in each heading.

### 3.1 Prompt, from C2 — seven, recovered from `3bbd8fb4`

- **C7-R1** fence the data blocks: render gateOutput, taskFullText, priorIssues, issues and correctedTask inside an explicitly delimited data block that the surrounding prose tells the model is data and not instruction. Rejecting the heading shape at the contract stops a forged heading; it does not stop prose that reads as instruction without one.
- **C7-R2** restate the fence last: after any block carrying model-produced or tool-produced text, re-emit the scope fence and the return contract so the last substantive instruction the model reads is the engine's, not the block's. Today the escalation block and the gate output both land after the fence.
- **C7-R3** shell-quote every interpolated value that reaches a command position - repoRoot, worktree, branch, baseBranch, launchCommit, libDir, writingPlansGlob, integrationWorktree - so correctness stops depending on the character class the contract admits. The narrow classes shipped in C2 are a deny gate, not quoting.
- **C7-R4** quote the pathspec list in composeReviewPrompt: prompt-execute.mjs renders fileScope.edit through join(" ") into two git pathspec positions and through JSON.stringify twelve lines later, and one file must not carry both spellings of one list.
- **C7-R5** give scopedCheckCmd an argv form. It is irreducibly a shell command, so no character class can narrow it; the engine should pass an argv array and the prompt should render it quoted rather than pasting a command string the model runs verbatim.
- **C7-R6** decide the fate of the read-context clause on the review path once the engine can emit fileScope.truncated.list: C2 makes an edit-list truncation throw for review and security, and C7 must either keep that halt or give the reviewer a prompt that names the omission instead of the do-not-flag-missing instruction.
- **C7-R7** delete the inline twin. Once mitosis.js and run-engine.mjs compose through the registry, retire the prose-anchor divergence guard with them; it exists only while two copies do.

Decision 0424 records that two of these seven are deferred security HIGHs. No surviving artifact tags which two. R3 and R5 are the two literal command-injection items and are the best-grounded candidates; R1 and R2 are prompt-injection framing. This attribution is inference and is flagged as an open question in section 6, not asserted.

### 3.2 Transcription, from C4 — six, recovered from `3bbd8fb4`

- **C7-T1** re-sync run-engine.mjs with mitosis.js when the wiring lands. Its fence and integrate dispatches are live twins of two of the eighteen: mitosis-execute.js imports run-engine.mjs, so converting mitosis.js alone converts code the live path never runs. C4 leaves both twins untouched on purpose - editing the live twin before C7 owns the wiring is what broke C1 - and this census names them so the divergence is measured rather than assumed.
- **C7-T2** resolve divergence.mjs, a THIRD twin the C4 plan did not record. It carries its own divergence-check dispatch and nothing in .claude/lib or .claude/workflows imports it, so it is a dead copy of the mitosis.js block. C7 either deletes it or wires it up; leaving an unimported twin means a future reader converts one copy and ships the other.
- **C7-T3** keep the label the site name. This census resolves every dispatch through its label, so a conversion that removes a dispatch must remove its label with it; a converted site that keeps a label would be counted as still dispatching, and a dispatch that loses its label halts the census rather than passing unseen.
- **C7-T4** remove the dispatch of every converted site when the wiring lands, and tighten this census with it. Converted here means a deterministic replacement exists and is pinned to the incumbent command, NOT that the site stopped dispatching: every one of the eighteen still reaches a model, because C4 leaves mitosis.js byte-identical to its parent. When C7 replaces a dispatch with a call into the substrate, the vanished-kind halt must become a per-kind expectation - a converted kind dispatches nowhere, an unconverted kind still does - so the two states stay distinguishable rather than collapsing into one.
- **C7-T5** dispatch ci-fact-extract, or retire it. It is registered with the prompt authority and carries the only two ci report fields no runner this engine deploys emits in a machine-readable form, but no dispatch reaches it: the incumbent still asks one agent for all six fields at once. When C7 wires the ci loop onto this substrate it must dispatch this kind for the two path lists and read the other four from gh and git, then delete the pending declaration that excuses it here. If instead the two fields are dropped, the ci-to-green loop escalates on every red run and that capability regression is chosen deliberately rather than by default.
- **C7-T6** supply and bound the spec fingerprint reader. readSpecContentHash injects readFileBytes, and no probe pins what a real reader does with a large file, a directory, a symbolic link or a file replaced between the stat and the read; the reader C7 supplies is the first one that meets a real filesystem, and it needs a size bound and a refusal for anything that is not a regular file.

Reconciliation with decision 0427, "three legacy twins stay unconverted as named C7 obligations": the three twins are named across two obligations, not three. C7-T1 names two sites in run-engine.mjs; C7-T2 names the third in divergence.mjs. Three sites, two rows.

Decision 0429 filed C7-T4 in place of an impossible T13. C7-T4's text was already present before 0429 was recorded; 0429 widens the existing id to absorb T13's remainder rather than minting a new one.

C7-T3 and the census half of C7-T4 are partly moot: the census module that hosted them was deleted by `2087dd51`. The underlying code action in T4 (remove the dispatch of every converted site) remains real. T3 is a constraint on a census that no longer exists and is a candidate for formal retirement.

### 3.3 Boundary, from C6 — four, recovered from `f0ab1c24`

- **C7-B1** port both mechanical dispatches onto this substrate. mitosis.js compiles under the workflow sandbox, whose allowed globals carry no require, no process and no fs, so the call site cannot import the program: C7 must supply the value from outside the sandbox rather than making the sandboxed source call in.
- **C7-B2** re-sync run-engine.mjs with mitosis.js in the same commit. The prose block and the dispatch block are byte-identical across the two files and run-engine.mjs is classified WHOLE by the mirror census, so a one-sided edit reddens mirror-guard; converting mitosis.js alone converts code the live path never runs.
- **C7-B3** delete the model-produced base census when the mechanical dispatches go. The recheck today embeds a baseCensus a model returned under a schema that constrains nothing, and treats it as the authoritative base side; this substrate computes that census in process, so the trust boundary disappears with the dispatch rather than needing a validator.
- **C7-B4** leave the judgment dispatch alone. boundary-fix asks a model to fix code and is a registered judgment kind; it is named here so the conversion list distinguishes it from the two mechanical sites rather than sweeping all three together.

C7-B4 is a marker, not work. It is carried so the conversion list distinguishes `boundary-fix` from the two mechanical sites.

### 3.4 Journal, from C3 — seven, live at `journal-store.mjs:21-29`

C7-J1 through C7-J7 remain in the tree and are not reproduced here. Read them at the path above. In summary: J1 deletes `appendRunJournal` and its six dispatches; J2 moves the clock read to the process boundary; J3 preserves site 2's escalation asymmetry; J4 decides the genesis-store migration together with its reader; J5 decides the fate of the `.gitignore` and directory-creation side effects; J6 keeps the ship-checkpoint write cut on the fresh path; J7 decides whether an invalid ci-attempt fingerprint is refused at write time.

`journal-store.test.mjs:363-372` asserts the array. Its regex loop enumerates J1 through J6 only; J7 exists in the array but is not individually asserted by id.

### 3.5 Coupling, from C5 — one, live at `coupling-review.mjs:35-42`

- **C5-O4** names C7 as owner: `couplingResolution` is written onto the hardened graph but the engine task map is built from nine named fields, and neither `coupling` nor `couplingResolution` is one of them, so the resolution does not survive into `engineArgs.tasks`. C7 owns carrying it through as a belt-and-braces check once the task map is computed rather than reported.

C5-O1, O2, O3, O5 and O6 are accepted residuals or owned by D1. They are not C7's and are not CP's.

### 3.6 Orphan: the redispatch classification

SPEC residual 7, `.claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md:588`. `redispatch` (`mitosis.js:3569`) is the shared corrective wrapper `makeRemediation` reuses after any stage fails, mechanical or judgment. Its nature is fixed by the stage that triggered it, so it belongs to neither column of the section 1.1 census. It must be given a determinate home: either the retry becomes a property of each converted stage, or it survives as an eleventh judgment kind. It may not be left unclassified.

This obligation carries no `C7-<X><n>` id and sits in none of the five arrays.

## 4. Split: what CP drains, what C7 keeps

No obligation in this inventory describes tick-loop work. None touches the scheduling mechanism (`runSchedule`, `runScheduleTick`, `joinTick`, `runEngine`) that replaces the `Promise.allSettled` loop at `mitosis.js:2544-2574`. That is the outcome 0424 predicted.

**CP drains:** C7-R1 through R7, C7-T1 through T6, C7-B1 through B3, C7-J1 through J7, C5-O4. Twenty-four items.

**CP carries forward as markers:** C7-B4 (a "leave alone" note, no work).

**C7 keeps:** the tick loop, and the `redispatch` classification.

`redispatch` stays with C7 because thread criterion c5 assigns it there in terms: "redispatch given a determinate home in C7". It is drainable by CP on the technical merits, and moving it would tighten C7 further, but a pinned acceptance criterion names C7 and reassignment is a decision to be taken explicitly, not folded in silently. Section 6 records it as an open question.

## 5. Sequencing and merge risk

C7-J1, C7-T1, C7-T2, C7-B1 and C7-B2 all touch `mitosis.js` and/or `run-engine.mjs` — the same files C7's tick-loop replacement edits. The line ranges differ (`mitosis.js:2544-2574` for scheduling, roughly `:4263-5574` for the checkpoint and dispatch sites). This is a merge-sequencing constraint between CP and C7, not a functional coupling.

CP must land before C7 is cut, or the two will edit the same files concurrently.

C7-B1, C7-B2 and C7-B3 depend on C6 being present on the stack base. C6 lands via PR #124.

## 6. Acceptance criteria for CP

Pinned before work starts, per G0. This list is a ceiling: anything discovered above it is filed as a new item and does not reopen CP.

1. All twenty-four drainable obligations in section 4 are either discharged in code or explicitly re-filed with a named owner and a reason. No obligation is silently dropped.
2. The three deleted arrays are not resurrected as census apparatus. Where an obligation survives as work, it is tracked in this document or in its PR body, not in a re-added module whose purpose is to verify other verification code.
3. `run-engine.mjs` and `mitosis.js` are re-synced in the same commit wherever a twin is edited, so `mirror-guard` stays green.
4. The suite is green and all four gate verbs pass at the CP tip: `determinism`, `dispatchable-agent-schema-capable`, `exec-allowlist`, `phase-parity`.
5. CP merges to `feat/mitosis-os-process`, not to `main`, and its content presence on the base is asserted by file rather than by a MERGED status.

Open questions for ratification before CP is worked:

- **Q1.** Which two of C7-R1 through R7 are the deferred security HIGHs. Not recoverable from any artifact; R3 and R5 are the grounded guess. If the answer matters for sequencing, it must be re-derived from the code rather than recalled.
- **Q2.** Does `redispatch` stay in C7 (per criterion c5) or move to CP? Moving it requires amending c5.
- **Q3.** Is C7-T3 formally retired, given the census it constrains was deleted by `2087dd51`?
- **Q4.** Is `CP` the right name, or should the unit take a letter in the 0374 sequence?
