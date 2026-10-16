# Request Pipeline

Every request to create, change or fix something in a git repository picks one of three lanes before any work starts, and says the lane in one sentence. The lane sets how much interview, spec, build and review the change gets. Only the full lane asks the user anything, in one interview up front; from the user's approval of its read-back to the last pull request, the run asks nothing and never stops for an answer.

## When it does not apply

- The request changes nothing: a question, an explanation, a review or research.
- The user says to skip the pipeline for this request, or names another workflow for it.
- The session is itself part of a pipeline. A prompt that begins `Lane <n> of MSP`, a system prompt that names the session a mitosis Worker, and any agent a stage below dispatches each do their own task directly and never start a pipeline.
- The request points at an interphase package whose record says `handed-off`: start the full or standard lane at stage 2.

## Lanes

- Direct: the change fits in one sentence, its cause is known, and it adds no dependency and changes no schema, stored-data format or auth. In a new worktree on a new branch cut from the synced upstream, make the edit, run the tests that cover it, commit, push, and open a draft pull request assigned to the user with the title and body `pull-request render` prints. No spec, no mitosis and no review agent.
- Standard: a small change that interphase's brief lane can carry. interphase writes a brief without an interview, mitosis builds it once, the reviewers review it once, and every confirmed blocker and confirmed advisory finding is fixed directly on the branch, with the fix's tests run and no second review round.
- Full: everything else. interphase interviews the user up front: the intent (the goal, why, and what success looks like), then numbered rounds of questions, each with a recommended answer, then a read-back to approve. From the approval on, mitosis builds, independent reviewers judge, and confirmed blockers and confirmed advisory findings are fixed directly on the branch, at most two fix rounds.

When interphase writes a full spec for a request sent down the standard lane, because one of the brief lane's conditions fails, the request is in the full lane from then on, still without an interview.

## After the interview

- A gap any stage finds later is filled with the reading the recorded intent best supports, and the pull request shows it as an assumption naming the intent line it relied on.
- An advisory finding the validator confirms is fixed in the same pass as the blockers; one it rejects is dropped and appears in no comment or report.
- The spec is slim, reviewed once and disposable after merge. The glossary and decision records interphase writes ship with the first pull request.
- Never merge and never mark a pull request ready.

## Run it

For the standard and full lanes, invoke the `pipeline:run` skill before stage 1, and again after a compaction before acting. It holds every stage: Sync, the logbook continuity, interphase, mitosis, review, validation, the fix pass, ship and stop.
