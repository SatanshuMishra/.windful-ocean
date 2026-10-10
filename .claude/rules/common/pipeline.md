# Request Pipeline

Every request to create, change or fix something in a git repository runs three stages: interphase writes the spec and its Steps, mitosis builds them, and independent reviewers judge the build. Every concern the reviewers raise goes back to interphase, and the loop repeats until a round is green. The pipeline runs autonomously: no stage asks the user anything, and the loop has no round limit.

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

For every MSP the run held, with `<base>` and `<branch>` from the JSON result, run all of these in that MSP's worktree, every MSP at once:

- `code-reviewer` on `<base>...<branch>`, with the spec and the decisions file as its standards.
- `conformance-auditor` on the same range, with the spec as its standard, judging the acceptance criteria the MSP's Steps name in `spec_ref`.
- `security-reviewer` on the same range when the diff touches auth, input handling, data access, secrets or an external integration.
- The project's full test suite, its one-line result kept at `<home>/suite-<msp>.txt`.

Write every concern of the round to `<home>/review/round-<n>/<msp>.md`: reviewer findings, auditor verdicts, failing BLOCKING commands, mitosis attention items and suite failures, each with its source, severity, `file:line` and problem.

## Green

A round is green when all of these hold:

- The JSON result of every mitosis run in the round reports exit code 0: every MSP `committed` or `unchanged`, every gate verdict `pass` or `not-applicable`, reconcile clean. The one exception is an `inert` verdict on a test that proves a criterion titled `Unchanged:`, or a bug template's unchanged-behaviour check: that test passes without the work by design, so it counts as `pass` here and goes to the final report as an unchanged-behaviour check.
- No reviewer reports a CRITICAL, HIGH or MEDIUM finding, and no auditor verdict is NOT MET.
- Every BLOCKING command a reviewer names exits 0.
- The full suite passes on every MSP branch, apart from failures that fail the same way on its base without the work; those go to the final report and never into the loop.

LOW findings never reopen the loop; they go to the user in the final report.

## Loop back

- For each MSP with a concern, start a new interphase run. Its request names the round's findings file and every earlier round's findings file for that MSP; the original spec and decisions file as binding; the MSP's branch and worktree as where the code under review lives and where probes run, with `--repo <worktree>`; the MSP's write-set as the files a fix changes; and ends `Work autonomously.`
- A fix that needs a file another MSP owns belongs to that MSP's fix run. A fix that needs a file no MSP owns takes it, and its pull request names that file under risk.
- Run the interphase runs one after another, then build every fix spec as in stage 2, with the MSP's branch as `--feature-branch` and its own run home.
- Merge each fix run's branches into the MSP's branch in the MSP's worktree, then merge that branch into every MSP stacked on it, in stack order. Review again from stage 3, always the MSP's whole range, never the fix alone.
- There is no round limit. A concern that returns is never answered the same way twice: the findings history in each request shows interphase every fix already tried.

## Ship

Once a round is green:

- Run `SHIP=1 <home>/run.zsh --resume` on the original run; it gates and reconciles every MSP again and ends each one `pushed`. Reconcile findings that name only files a fix round took outside the write-set are expected; list them in the report.
- Read each MSP's title, body, branch and base from mitosis's JSON result.
- For each pushed MSP, in stack order, call the GitHub MCP `create_pull_request` tool with the owner and repository from `origin`, that branch as head, that base, the title and body exactly as mitosis wrote them, and `draft` true. When the base is a feature branch missing from the remote and every commit on it is already on the remote's default branch, use the remote's default branch as the base; otherwise push the feature branch first, so each pull request shows only its own work.
- Assign each pull request to the signed-in user: `get_me` for the login, then `issue_write` with that login as assignee.
- A refusal by the format hook is a ship failure. mitosis's title and body are never edited.
- Report the pull requests in stack order, the rounds it took, the reviews that ran, every top risk interphase listed, every LOW finding and every unproven criterion. Never merge and never mark a pull request ready.

## Stop

The loop ends only at green or at a hard failure. Report and stop on a mitosis refusal, an interphase guard difference, or a ship failure. Never work around one.
