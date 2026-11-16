# Request Pipeline

Every request to create, change or fix something in a git repository picks one of three lanes before any work starts, and says the lane in one sentence. The lane sets how much interview, spec, build and review the change gets. Only the full lane asks the user anything, in one interview up front; from the user's approval of its read-back to the last pull request, the run asks nothing and never stops for an answer.

## When it does not apply

- The request changes nothing: a question, an explanation, a review or research.
- The user says to skip the pipeline for this request, or names another workflow for it.
- The session is itself part of a pipeline. A mitosis Lane or Worker, a pipeline drive step, a lighthouse or interphase child session and any agent the `pipeline:run` skill dispatches each do their own task directly and never start a pipeline.
- The request points at an interphase package whose record says `handed-off`: start the full or standard lane at stage 2.

## Lanes

- Direct: the change fits in one sentence, its cause is known, and it adds no dependency and changes no schema, stored-data format or auth. In a new worktree on a new branch cut from the synced upstream, make the edit, run the tests that cover it, commit, push, and open a pull request, ready for review and not a draft, assigned to the user with the title and body `pull-request render` prints. No spec, no mitosis and no review agent.
- Standard: a small change that interphase's brief lane can carry. interphase writes a brief without an interview, mitosis builds it once, the reviewers review it once, and every confirmed blocker is fixed directly on the branch, with the fix's tests run and no second review round.
- Full: everything else. interphase interviews the user up front: the intent (the goal, why, and what success looks like), then numbered rounds of questions, each with a recommended answer, then a read-back to approve. From the approval on, mitosis builds, independent reviewers judge, and confirmed blockers are fixed directly on the branch until review is green or a diagnosis classes a blocker blocked, which opens it as a draft pull request, or stops the run with nothing pushed when the blocked blocker is CRITICAL.

When interphase writes a full spec for a request sent down the standard lane, because one of the brief lane's conditions fails, the request is in the full lane from then on, still without an interview.

## After the interview

- A gap any stage finds later is filled with the reading the recorded intent best supports, and the pull request shows it as an assumption naming the intent line it relied on.
- An advisory finding is dropped whether the validator confirms or rejects it, and appears in no comment or report: only a blocker is fixed, since nothing would review an advisory's fix.
- The spec is slim, reviewed once and disposable after merge. The glossary and decision records interphase writes ship with the first pull request.
- Never merge a pull request.

## Run it

For the standard and full lanes, invoke the `pipeline:run` skill before stage 1, or before stage 2 when the request starts there, and again after a compaction before acting.
