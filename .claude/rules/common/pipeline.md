# Request Pipeline

Every request to create, change or fix something in a git repository picks one of three lanes before any work starts, and says the lane in one sentence. The lane sets how much spec, build and review the change gets. No lane asks the user anything.

## When it does not apply

- The request changes nothing: a question, an explanation, a review or research.
- The user says to skip the pipeline for this request, or names another workflow for it.
- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent a stage below dispatches each do their own task directly and never start a pipeline.
- The request points at an interphase package whose record says `handed-off`: start the full or standard lane at stage 2.

## Lanes

- Direct: the change fits in one sentence, its cause is known, and it adds no dependency and changes no schema, stored-data format or auth. In a new worktree on a new branch cut from the synced upstream, make the edit, run the tests that cover it, commit, push, and open a draft pull request assigned to the user with the title and body `pull-request render` prints. No spec, no mitosis and no review agent.
- Standard: a small change that interphase's brief lane can carry. Run stages 1 to 3 with one review round: interphase writes a brief, mitosis builds it once, the reviewers review it once, and every confirmed blocker is fixed directly on the branch, with the fix's tests run and no second review round.
- Full: everything else. Run stages 1 to 3 with fix rounds as Loop back says.

When interphase writes a full spec for a request sent down the standard lane, because one of the brief lane's conditions fails, the request is in the full lane from then on.

## Sync

- Before any stage reads code, and whenever the user says a pull request merged, bring the checkout's current branch up to date: `git fetch`, then `git merge --ff-only` onto its upstream. When git refuses because the branch diverged or an uncommitted edit would be overwritten, leave the checkout as it is, build from the upstream's tip as Stage 2 says, and name the reason as a top risk.
- In the user's checkout, never commit, stash, reset or switch branches; fetching and fast-forwarding its current branch, and creating the `pipeline-base/<slug>` branch Stage 2 names, are the only changes allowed. Workers see only committed work: when the checkout has uncommitted changes in a file a Step touches, build from the committed state and name those files as a top risk.

## Continuity: logbook

- In the standard and full lanes, before stage 1, or before stage 2 when the request starts there, open a logbook thread for the request with `open_thread`, or pick up an existing one, and resume it with `resume_thread`, so the session holds it; a hook refuses the pipeline's interphase call, and the check-run line at the top of every `run.zsh` refuses to start it, until it does.
- Each run home's `CHARTER.md` lists the spec, the decisions file and the record on lines starting `- Spec:`, `- Decisions:` and `- Record:`.
- Record the boundaries: interphase's hand-off, before the first build; each amendment's hand-off, before its first build; and the ship, before `SHIP=1`. At each, call `record_decision` for the held thread with the boundary named in its title, at least two options, `option_reasons` with one reason per option (when the running logbook accepts it), and the outcome; then `update_thread` with the next step as an action and `next_step_records` naming the records it needs. The check-run line refuses a first build and a ship run until both are recorded; a `--plan-only` run and a `--resume` run without `SHIP` need only the held thread.
- After a compaction, read the `# Logbook:` and `# Pipeline:` briefings before acting; when either is missing, call `resume_thread` on the held thread with `full_briefing`, and read `<home>/rounds.md`.
- When the pipeline ends, `park_thread` with the next step, or `close_thread` when every pull request is open and the definition of done holds.

## Stage 1: interphase

- Classify the request with interphase's Phase 2 rules, say the pathway in one sentence, and invoke `interphase:feature`, `interphase:bug`, `interphase:prototype` or `interphase:project` with the request followed by `Work autonomously.` `/interphase` is the user's to type; each pathway skill reroutes itself when its own classification differs.
- interphase works autonomously in every run of this pipeline: it asks nothing, seeks no approval and records each choice as an assumption.
- interphase's rules govern until its Phase 10 report. Nothing from this rule enters the spec, the decisions file or the Steps.
- Its Phase 10 stop ends the interphase run, not the pipeline: go on to stage 2 in the same turn. Every decision it lists as a top risk goes to the final report.

## Stage 2: mitosis

- One pipeline keeps everything in its run home, `~/.mitosis/<repo>/<slug>/`: `<repo>` is the repository folder's name and `<slug>` is the slug interphase chose. `<home>/rounds.md` holds one line per round: the round, the spec paths, the mitosis run directory and the verdict. A later session resumes from the run home alone.
- Build from the repository root, with the branch the user's checkout is on as `--feature-branch`. When Sync could not fast-forward that branch, create `pipeline-base/<slug>` at its upstream with `git branch pipeline-base/<slug> @{u}` and pass that branch instead.
- `~/.mitosis/<repo>/accept.zsh` maps the one-test command interphase recorded onto mitosis's acceptance contract: exit 0 passes, 1 fails, anything else is inconclusive, and a module missing because the work was reverted is a failure. Write it once per repository and reuse it.
- `<home>/worker-rules.txt` opens with `You are a mitosis Worker building one Lane` and binds every Worker to: its brief and charter as its whole instruction, its write-set only, every command in the foreground, no change to the git index, stash or history, no question to the user, the project's full test suite run once, after its last change, and the one-line JSON return as its last line.
- `<home>/dispatch.zsh` runs `claude -p "$task" --model "$model" --permission-mode bypassPermissions --append-system-prompt "$(cat <home>/worker-rules.txt)"` with the environment the project needs.
- `<home>/CHARTER.md` names the spec, the decisions file and the record by absolute path in the user's checkout, to be read there and never edited, and states the project facts every Worker needs.
- Copy the interphase items file to `<home>/items.json` before each `--plan-only` until the run's first build starts, and never refresh the copy after that, so an amendment that renders the spec's items file again leaves every resume and the ship planning from the same items.
- When `graphify-out/graph.json` exists, copy it to `<home>/graph.json` once, before the run's first `--plan-only`, and never refresh the copy during the run, so every resume and the ship plan from the same graph.
- `<home>/run.zsh` holds the whole invocation, so every resume and the ship reuse the same flags: `--items <home>/items.json`, `--run-dir ~/.mitosis/runs/<repo>/<slug>`, `--charter`, `--decisions` the interphase decisions file, `--feature-branch`, the dispatch and acceptance templates, `--tier-model top=` the newest Opus and `cheap=` the newest Sonnet, `--timeout`, and `--graph <home>/graph.json` when the run home holds that copy. It passes `--pr-type`, `--pr-scope`, `--pr-subject` and `--pr-why` on every run (the type that names the change, `feat` for a new capability and `fix` for a bug; the scope the area the spec changes; the subject the spec's title as a lowercase imperative phrase; one to eight Why lines, each a sentence, from the spec's problem section), `--no-push` unless `SHIP` is set, and never `--pr-command`. Its first command is `pipeline check-run "${0:A}" "$@" || exit $?`, which refuses a first build or a ship run whose boundary the session has not recorded.
- Run `--plan-only` first. A fatal plan finding is a defect in the Steps: hand the report to interphase, which reopens its Phase 9.
- Read mitosis's last stdout line, the JSON result, not its report.

## Stage 3: review

Rounds count per MSP: an MSP's round `<n>` is its nth review. Every round reviews the original run's MSP: its label as `--msp`, its worktree, its `<base>` and `<branch>` from the original run's JSON result, and the original run's spec and decisions file. Run all of this in each MSP's worktree, for every MSP still in the loop at once:

- An MSP mitosis did not commit gets one `<home>/run.zsh --resume`; still not committed, it is a hard failure.
- An MSP mitosis reports `unchanged` in its round 1 is not reviewed: its findings file and its verdicts file each hold the empty JSON array `[]`, and it goes straight to Validate.
- Write `git diff <base>...<branch>`, run in the worktree, to `<home>/review/round-<n>/<msp>.diff`.
- Run the project's full test suite once in the MSP's worktree at the round's head, before any reviewer starts, and keep its whole output at `<home>/review/round-<n>/<msp>.suite.txt`; no stage runs the full suite again for that head.
- In round 1, run `code-reviewer` on every MSP; `conformance-auditor` unless the original spec's header holds the line `Lane: brief.`; and `security-reviewer` when the diff touches auth, input handling, data access, secrets or an external integration.
- From round 2, review only the fix: run `code-reviewer`; `security-reviewer` only when the fix commits touch auth, input handling, data access, secrets or an external integration; and `conformance-auditor` only when a carried blocker is a NOT MET criterion, with `criteria` set to those criteria alone.
- In round 1, when an MSP changes UI or device code, dispatch one agent on the newest Sonnet per target platform to run the main paths the user's request names, through the project's drive scripts or vmlab, at the round's head. From round 2, and before ship in the standard lane, run it again at the new head on each platform where a main path was broken, for those paths only. Keep each report at `<home>/review/round-<n>/<msp>.smoke-<platform>.txt`. A platform with no way to drive it gets no smoke run and goes to the final report as unproven.
- Render every brief with `pipeline brief --template <agent>` and one `--set <name>=<value>` per placeholder, and pass its output as the agent's whole prompt, unchanged and with nothing added. The templates are the plugin's bundled briefs `code-reviewer`, `security-reviewer`, `conformance-auditor` and `validator`; the tool fills `review_bar` itself.
- The values: `range` is `<base>...<branch>`; `worktree` the MSP's worktree; `base` and `head` the commits `<base>` and `<branch>` point at; `round` the MSP's round number; `previous_head` the head reviewed in the MSP's previous round and `earlier_findings` a comma-separated list of the earlier rounds' `<home>/review/round-<n>/<msp>.md` files, both `none` in round 1; `spec` and `decisions` the original run's files; `criteria` the acceptance criterion numbers the MSP's Steps and its amendments' Steps name in `spec_ref`, comma-separated with no spaces; `diff` the round's `.diff` file; `ledger` `~/.mitosis/<repo>/findings.jsonl`; `candidates` the round's candidates file; `suite` the round's `.suite.txt`; and `do_not_flag` `~/.mitosis/<repo>/do-not-flag.md`, or `none` when it does not exist.
- Collect into `<home>/review/round-<n>/<msp>.findings.json` one JSON array: each reviewer's last JSON array; for each suite failure, a finding with source `suite` and an id `U<n>`, HIGH when it does not fail the same way on the base and LOW when it does; for each main path a smoke run shows broken, a HIGH finding with source `suite` and an id `U<n>`; for each gate verdict `inconclusive`, and each reconcile finding of an undeclared write, a crossing or a fatal error, a HIGH finding with source `mitosis` and an id `M<n>`; and for each gate verdict `inert` and each listed file left unwritten, a LOW finding with source `mitosis`, since neither blocks. Each suite and mitosis finding the main conversation adds takes `security` true when it is a security finding as the review bar defines it, such as a failing test of a security control, and false otherwise.
- Every finding the main conversation adds has exactly the keys `id`, `source`, `severity`, `security`, `location`, `summary`, `reproduction` and `fix`, with `security` true or false; an id of one capital letter followed by one to three digits, unique in the file; a location of at most 200 characters; a summary of 1 to 500 characters; a reproduction and a fix of at most 2000 characters each; and every value on one line.
- Keep `<home>/review/round-<n>/<msp>.md` as the round's readable record: every finding with its source, severity, `file:line` and problem.

## Validate

For every MSP in the round, with `<slug>` always the original run's slug and `<msp>` the original run's MSP label:

- Run `pipeline candidates --findings <home>/review/round-<n>/<msp>.findings.json --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp> --round <n> --out <home>/review/round-<n>/<msp>.candidates.md`. It carries the previous round's confirmed findings, other than suite and mitosis findings, as P ids and prints the candidate count.
- When the count is above zero, dispatch one fresh `validator` with the brief rendered from `pipeline brief --template validator` as its whole prompt, and save its last JSON array as `<home>/review/round-<n>/<msp>.verdicts.json`. When the count is zero, that file holds `[]`.
- Run `pipeline record --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --round <n> --msp <msp> --findings <home>/review/round-<n>/<msp>.findings.json --verdicts <home>/review/round-<n>/<msp>.verdicts.json`. It confirms suite and mitosis findings of MEDIUM or worse without validation.
- When a reviewer's or the validator's output ends without a JSON array, or `candidates` or `record` refuses that array, dispatch that agent once more with the same brief. A second failure is a hard failure.
- Run `pipeline verdict --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp> --round <n>` and save its line as `<home>/review/round-<n>/<msp>.verdict.json`. Its outcome, `green`, `loop`, `stop` or `hard-failure`, is the verdict on the round in `<home>/rounds.md`. It stops after two fix rounds whatever the reviewers find.

## Green

A round is green when the MSP's `pipeline verdict` prints the outcome `green` and the full suite passes on its branch, apart from failures that fail the same way on its base without the work; those go to the final report and never into the loop.

Advisory findings, every finding the verdict does not list as a blocker, never reopen the loop; they go to the pull-request comment and the final report.

## Loop back

- In the standard lane, a `loop` outcome gets one direct fix and no second review: fix every blocker as below, run the tests that cover the fix, run the smoke run again as Stage 3 says, and ship; a main path still broken puts the request in the full lane from then on.
- In the full lane, for each MSP whose outcome is `loop`, fix every blocker in that round's saved `<msp>.verdict.json` directly on the MSP's branch, in its worktree: edit the code, run the tests that cover each fix, and commit with a message naming the blocker ids. Close each kind in the verdict's `close_as_whole` as a whole, by an allowlist or one general rule, never instance by instance.
- Amend the spec only when a blocker shows that a requirement of the spec itself was wrong. Then invoke the interphase pathway skill the spec was written with, naming the original spec's path as the handed-off spec to amend, the blocker as the only concern, the MSP's branch and worktree as where the code lives and probes run, with `--repo <worktree>`, `<msp>-amend-<a>`, where `<a>` is the amendment's number, as the MSP of every Step the amendment adds, and ending `Work autonomously.`; record its hand-off as Continuity says, and build the amendment with `<home>/amend-<a>.zsh`, a copy of `<home>/run.zsh` whose `--items` is `<home>/amend-<a>.items.json`, a copy of the amendment items file interphase reports made before each of the amendment's `--plan-only` runs until its first build starts, whose `--run-dir` is `~/.mitosis/runs/<repo>/<slug>-amend-<a>`, whose `--feature-branch` is the MSP's branch, and which always passes `--no-push`; run its `--plan-only` first, and merge its branch into the MSP's branch.
- A fix that needs a file another MSP owns belongs to that MSP. A fix that needs a file no MSP owns takes it, and its pull request names that file under risk.
- Merge each fixed MSP's branch into every MSP stacked on it, in stack order. Review again from Stage 3 as the MSP's next round, with the previous round's head as `previous_head`.
- An MSP whose outcome is `green` or `stop` is reviewed no further. An MSP whose outcome is `stop` ships with its blockers listed as Unresolved.
- When any MSP's outcome is `hard-failure`, stop the whole run.

## Ship

Once every MSP's latest outcome is `green` or `stop`, or, in the standard lane, its one direct fix is committed:

- For each MSP run `pipeline comment --ledger ~/.mitosis/<repo>/findings.jsonl --run <slug> --msp <msp>` and save its text, empty when it prints nothing, with the Write tool as `<home>/review/<msp>.comment.md`, so the configuration's secret scanner checks it. Then run `pipeline promote --ledger ~/.mitosis/<repo>/findings.jsonl --do-not-flag ~/.mitosis/<repo>/do-not-flag.md` once. An exit 2 from either, or a blocked write, is a hard failure.
- Record the ship boundary as Continuity says, then run `SHIP=1 <home>/run.zsh --resume` on the original run; it gates and reconciles every MSP again and ends each one `pushed`. Reconcile findings that name only files a fix took outside the write-set are expected; list them in the report.
- Read each MSP's title, body, branch and base from mitosis's JSON result.
- For each pushed MSP, in stack order, call the GitHub MCP `create_pull_request` tool with the owner and repository from `origin`, that branch as head, that base, the title and body exactly as mitosis wrote them, and `draft` true. When the base is a feature branch missing from the remote and every commit on it is already on the remote's default branch, use the remote's default branch as the base; otherwise push the feature branch first, so each pull request shows only its own work.
- Assign each pull request to the signed-in user: `get_me` for the login, then `issue_write` with that login as assignee.
- After assigning it, post the MSP's saved `<msp>.comment.md`, when it is not empty, on that pull request with the GitHub MCP `add_issue_comment` tool, its text unchanged.
- A refusal by the format hook is a ship failure. mitosis's title and body are never edited; the review notes go in the comment.
- Report the pull requests in stack order, the lane, the rounds it took, the reviews and smoke runs that ran, every top risk interphase listed, every MSP's Unresolved blockers, the known-risk kinds, every advisory finding with the security findings the comment left out, the validator's rejections by test, every do-not-flag addition `promote` printed, and every unproven criterion. Never merge and never mark a pull request ready.

## Stop

The loop ends at green, at a stop verdict, or at a hard failure. Each of these is a hard failure that comes before any push and pushes nothing: a `hard-failure` verdict, an exit 2 from `pipeline` that remains after Validate's one retry, an MSP still not committed after its one `--resume`, and a blocked comment write. Report and stop on any of them, on a mitosis refusal, an interphase guard difference, or a ship failure. Never work around one.
