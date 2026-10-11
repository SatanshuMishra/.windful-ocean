# Request Pipeline

Every request to create, change or fix something in a git repository runs three stages: interphase writes the spec and its Steps, mitosis builds them, and independent reviewers judge the build. Every confirmed blocker goes back to interphase, and the loop repeats until a round is green, a round makes no progress or a hard failure stops it. The pipeline runs autonomously: no stage asks the user anything, and the loop has no round limit.

## When it does not apply

- The request changes nothing: a question, an explanation, a review or research.
- The user says to skip the pipeline for this request, or names another workflow for it.
- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent a stage below dispatches each do their own task directly and never start a pipeline.
- The request points at an interphase package whose record says `handed-off`: start at stage 2.

## Stage 1: interphase

- Classify the request with interphase's Phase 2 rules, say the pathway in one sentence, and invoke `interphase:feature`, `interphase:bug`, `interphase:prototype` or `interphase:project` with the request followed by `Work autonomously.` `/interphase` is the user's to type; each pathway skill reroutes itself when its own classification differs.
- interphase works autonomously in every run of this pipeline: it asks nothing, seeks no approval and records each choice as an assumption.
- interphase's rules govern until its Phase 10 report. Nothing from this rule enters the spec, the decisions file or the Steps.
- Its Phase 10 stop ends the interphase run, not the pipeline: go on to stage 2 in the same turn. Every decision it lists as a top risk goes to the final report.

## Stage 2: mitosis

- One pipeline keeps everything in its run home, `~/.mitosis/<repo>/<slug>/`: `<repo>` is the repository folder's name and `<slug>` is the slug interphase chose. `<home>/rounds.md` holds one line per round: the round, the spec paths, the mitosis run directory and the verdict. A later session resumes from the run home alone.
- Build from the repository root, with the branch the user's checkout is on as `--feature-branch`. Workers see only committed work: when the checkout has uncommitted changes in a file a Step touches, build from the committed state and name those files as a top risk in the final report. Never commit, stash or check out in the user's checkout.
- `~/.mitosis/<repo>/accept.zsh` maps the one-test command interphase recorded onto mitosis's acceptance contract: exit 0 passes, 1 fails, anything else is inconclusive, and a module missing because the work was reverted is a failure. Write it once per repository and reuse it.
- `<home>/worker-rules.txt` opens with `You are a mitosis Worker building one Lane` and binds every Worker to: its brief and charter as its whole instruction, its write-set only, every command in the foreground, no change to the git index, stash or history, no question to the user, and the one-line JSON return as its last line.
- `<home>/dispatch.zsh` runs `claude -p "$task" --model "$model" --permission-mode bypassPermissions --append-system-prompt "$(cat <home>/worker-rules.txt)"` with the environment the project needs.
- `<home>/CHARTER.md` names the spec, the decisions file and the record by absolute path in the user's checkout, to be read there and never edited, and states the project facts every Worker needs.
- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags: `--items` the interphase items file, `--run-dir ~/.mitosis/runs/<repo>/<slug>`, `--charter`, `--decisions` the interphase decisions file, `--feature-branch`, the dispatch and acceptance templates, `--tier-model top=` the newest Opus and `cheap=` the newest Sonnet, `--timeout`, and `--graph graphify-out/graph.json` when that file exists. It passes `--pr-type`, `--pr-scope`, `--pr-subject` and `--pr-why` on every run (the type that names the change, `feat` for a new capability and `fix` for a bug; the scope the area the spec changes; the subject the spec's title as a lowercase imperative phrase; one to eight Why lines, each a sentence, from the spec's problem section), `--no-push` unless `SHIP` is set, and never `--pr-command`.
- Run `--plan-only` first. A fatal plan finding is a defect in the Steps: hand the report to interphase, which reopens its Phase 9.
- Read mitosis's last stdout line, the JSON result, not its report.

## Stage 3: review

Rounds count per MSP: an MSP's round `<n>` is its nth review. Every round, fix rounds included, reviews the original run's MSP: its label as `--msp`, its worktree, its `<base>` and `<branch>` from the original run's JSON result, and the original run's spec and decisions file. Run all of this in each MSP's worktree, for every MSP still in the loop at once:

- An MSP mitosis did not commit gets one `<home>/run.zsh --resume`; still not committed, it is a hard failure.
- An MSP mitosis reports `unchanged` in its round 1 is not reviewed: its findings file and its verdicts file each hold the empty JSON array `[]`, and it goes straight to Validate.
- Write `git diff <base>...<branch>`, run in the worktree, to `<home>/review/round-<n>/<msp>.diff`.
- Run `code-reviewer` on every MSP; `conformance-auditor` unless the original spec's header holds the line `Lane: brief.`; `security-reviewer`, at any size, when the diff touches auth, input handling, data access, secrets or an external integration; and the project's full test suite every round, its one-line result kept at `<home>/suite-<msp>.txt`.
- Render every brief with `node ~/.claude/lib/pipeline/pipeline.mjs brief --template ~/.claude/lib/pipeline/briefs/<agent>.md` and one `--set <name>=<value>` per placeholder, and pass its output as the agent's whole prompt, unchanged and with nothing added. The templates are `~/.claude/lib/pipeline/briefs/code-reviewer.md`, `~/.claude/lib/pipeline/briefs/security-reviewer.md`, `~/.claude/lib/pipeline/briefs/conformance-auditor.md` and `~/.claude/lib/pipeline/briefs/validator.md`; the tool fills `review_bar` itself.
- The values: `range` is `<base>...<branch>`; `worktree` the MSP's worktree; `base` and `head` the commits `<base>` and `<branch>` point at; `round` the MSP's round number; `previous_head` the head reviewed in the MSP's previous round and `earlier_findings` a comma-separated list of the earlier rounds' `<home>/review/round-<n>/<msp>.md` files, both `none` in round 1; `spec` and `decisions` the original run's files; `criteria` the acceptance criterion numbers the MSP's Steps name in `spec_ref`, comma-separated with no spaces; `diff` the round's `.diff` file; `ledger` `~/.mitosis/<repo>/findings.jsonl`; `candidates` the round's candidates file; and `do_not_flag` `~/.mitosis/<repo>/do-not-flag.md`, or `none` when it does not exist.
- Collect into `<home>/review/round-<n>/<msp>.findings.json` one JSON array: each reviewer's last JSON array; for each suite failure, a finding with source `suite` and an id `U<n>`, HIGH when it does not fail the same way on the base and LOW when it does; and for each gate verdict other than `pass` or `not-applicable`, apart from the inert exception in Green, and each reconcile finding, a HIGH finding with source `mitosis` and an id `M<n>`.
- Every finding the main conversation adds meets the tool's field rules: exactly the keys `id`, `source`, `severity`, `location`, `summary`, `reproduction` and `fix`; an id of one capital letter followed by one to three digits, unique in the file; a location of at most 200 characters; a summary of 1 to 500 characters; a reproduction and a fix of at most 2000 characters each; and every value on one line.
- Keep `<home>/review/round-<n>/<msp>.md` as the round's readable record: every finding with its source, severity, `file:line` and problem.

## Validate

For every MSP in the round, with `<slug>` always the original run's slug and `<msp>` the original run's MSP label, fix rounds included:

- Run `node ~/.claude/lib/pipeline/pipeline.mjs candidates --findings <home>/review/round-<n>/<msp>.findings.json --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp> --round <n> --out <home>/review/round-<n>/<msp>.candidates.md`. It carries the previous round's confirmed reviewer blockers as P ids and prints the candidate count.
- When the count is above zero, dispatch one fresh `conformance-auditor` with the brief rendered from `~/.claude/lib/pipeline/briefs/validator.md` as its whole prompt, and save its last JSON array as `<home>/review/round-<n>/<msp>.verdicts.json`. When the count is zero, that file holds `[]`.
- Run `node ~/.claude/lib/pipeline/pipeline.mjs record --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --round <n> --msp <msp> --findings <home>/review/round-<n>/<msp>.findings.json --verdicts <home>/review/round-<n>/<msp>.verdicts.json`. It confirms suite and mitosis findings of MEDIUM or worse without validation.
- When a reviewer's or the validator's output ends without a JSON array, or `candidates` or `record` refuses that array, dispatch that agent once more with the same brief. A second failure is a hard failure.
- Run `node ~/.claude/lib/pipeline/pipeline.mjs verdict --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp> --round <n>` and save its line as `<home>/review/round-<n>/<msp>.verdict.json`. Its outcome, `green`, `loop`, `stop` or `hard-failure`, is the verdict on the round in `<home>/rounds.md`.

## Green

A round is green when all of these hold:

- The JSON result of every mitosis run in the round reports exit code 0: every MSP `committed` or `unchanged`, every gate verdict `pass` or `not-applicable`, reconcile clean. The one exception is an `inert` verdict on a test that proves a criterion titled `Unchanged:`, or a bug template's unchanged-behaviour check: that test passes without the work by design, so it counts as `pass` here and goes to the final report as an unchanged-behaviour check.
- The MSP's `pipeline.mjs verdict` prints the outcome `green`.
- The full suite passes on every MSP branch, apart from failures that fail the same way on its base without the work; those go to the final report and never into the loop.

Advisory findings, every finding the verdict does not list as a blocker, never reopen the loop; they go to the pull-request comment and the final report.

## Loop back

- For each MSP whose outcome is `loop`, start a new interphase run. Its request names that round's saved `<home>/review/round-<n>/<msp>.verdict.json` as the only concerns to fix; every earlier fix spec of the MSP as the fixes already tried; the original spec and decisions file as binding; the MSP's branch and worktree as where the code under review lives and where probes run, with `--repo <worktree>`; the MSP's write-set as the files a fix changes; and ends `Work autonomously.` It names no findings file.
- The request requires each kind in the verdict's `close_as_whole` to be closed as a whole, by an allowlist or one general rule, never instance by instance.
- A fix that needs a file another MSP owns belongs to that MSP's fix run. A fix that needs a file no MSP owns takes it, and its pull request names that file under risk.
- Run the interphase runs one after another, then build every fix spec as in stage 2, with the MSP's branch as `--feature-branch` and its own run home.
- Merge each fix run's branches into the MSP's branch in the MSP's worktree, then merge that branch into every MSP stacked on it, in stack order. Review again from Stage 3 as the MSP's next round, with the previous round's head as `previous_head`.
- An MSP whose outcome is `green` or `stop` is reviewed no further. An MSP whose outcome is `stop` ships with its blockers listed as Unresolved.
- When any MSP's outcome is `hard-failure`, stop the whole run.
- There is no round limit: a round that makes no progress ends the loop for its MSP with the outcome `stop`.

## Ship

Once every MSP's latest outcome is `green` or `stop`:

- Before `SHIP=1`, for each MSP run `node ~/.claude/lib/pipeline/pipeline.mjs comment --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp>` and save its text, empty when it prints nothing, with the Write tool as `<home>/review/<msp>.comment.md`, so the configuration's secret scanner checks it. Then run `node ~/.claude/lib/pipeline/pipeline.mjs promote --ledger ~/.mitosis/<repo>/findings.jsonl --do-not-flag ~/.mitosis/<repo>/do-not-flag.md` once. An exit 2 from either, or a blocked write, is a hard failure.
- Run `SHIP=1 <home>/run.zsh --resume` on the original run; it gates and reconciles every MSP again and ends each one `pushed`. Reconcile findings that name only files a fix round took outside the write-set are expected; list them in the report.
- Read each MSP's title, body, branch and base from mitosis's JSON result.
- For each pushed MSP, in stack order, call the GitHub MCP `create_pull_request` tool with the owner and repository from `origin`, that branch as head, that base, the title and body exactly as mitosis wrote them, and `draft` true. When the base is a feature branch missing from the remote and every commit on it is already on the remote's default branch, use the remote's default branch as the base; otherwise push the feature branch first, so each pull request shows only its own work.
- Assign each pull request to the signed-in user: `get_me` for the login, then `issue_write` with that login as assignee.
- After assigning it, post the MSP's saved `<msp>.comment.md`, when it is not empty, on that pull request with the GitHub MCP `add_issue_comment` tool, its text unchanged.
- A refusal by the format hook is a ship failure. mitosis's title and body are never edited; the review notes go in the comment.
- Report the pull requests in stack order, the rounds it took, the reviews that ran, every top risk interphase listed, every MSP's Unresolved blockers, the known-risk kinds, every advisory finding with the security findings the comment left out, the validator's rejections by test, every do-not-flag addition `promote` printed, and every unproven criterion. Never merge and never mark a pull request ready.

## Stop

The loop ends at green, at a stop verdict, or at a hard failure. Each of these is a hard failure that comes before any push and pushes nothing: a `hard-failure` verdict, an exit 2 from `pipeline.mjs` that remains after Validate's one retry, an MSP still not committed after its one `--resume`, and a blocked comment write. Report and stop on any of them, on a mitosis refusal, an interphase guard difference, or a ship failure. Never work around one.
