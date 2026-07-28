---
Status: accepted
Date: 2026-07-28T18:54:00.574Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0069. Reject the resident polling watcher; the merge-frontier advance becomes one idempotent deterministic command

## Context

The 2026-07-28 spec moved the non-stop property out of the engine into an orchestrator-level background watch (its section 3.5): a backgrounded gh/bash poll plus a heartbeat file plus three liveness states (watch-live / watch-expired / watch-absent). The user challenged polling as fragile and inefficient and directed a Fable researcher to audit it. Two facts settled it. First, the watcher was answering a question the forge is willing to push: the advance it triggers - fetch the advanced base, move the child's integration ref fresh onto it, replay only the child's own commits, push, open the PR - is deterministic git plumbing plus one pr-create call, with no LLM judgment in the common case (conflict is the exception, and its DETECTION is a non-zero exit). Today that path is an LLM dispatch (the reconcile-only shepherd, mitosis.js:3006-3044), which is why it looked like it needed a resident process at all. Second, a resident watcher dies with the session, so it never survived the overnight gap it was justified by; its own pre-mortem had already named silent stall as its failure mode. Research verified that GitHub's documented run-on-merge idiom is pull_request/types:[closed] with github.event.pull_request.merged==true, and that on:schedule workflows self-disable after 60 days of repo inactivity, killing scheduled polling as an option. The load-bearing constraint found: events triggered by the default GITHUB_TOKEN do not create new workflow runs (docs.github.com/en/actions/using-workflows/triggering-a-workflow), so a workflow-opened child PR gets no CI unless it authenticates with a fine-grained PAT or a GitHub App installation token.

## Options

- Keep the spec's section 3.5 resident watcher plus heartbeat plus three liveness states
- Local scheduled job (cron/launchd) running the advance periodically
- GitHub App plus a hosted webhook receiver
- Make the advance one idempotent deterministic command with two possible invokers: the human at next sit-down, and a merge-triggered GitHub Actions workflow

## Outcome

Adopt the idempotent command. The resident watcher, the heartbeat, and the three liveness states are DELETED from the spec (section 3.5 goes; section 10's M6 must be rewritten), and the advance is determinized from an LLM dispatch into a script so both invokers call the same code. The human-at-next-sit-down invoker is the MECHANISM and is always correct: zero infrastructure, zero process, zero tokens, and the human is present when a replay conflict needs judgment. The merge-triggered Actions workflow is an ACCELERATOR that is purely additive - it invokes the same script - and it is NOT yet approved: it costs one token secret whose failure mode is silent until the first missed advance, and it buys wall-clock CI (wake to a green child PR) rather than tokens, since both invokers cost nothing while idle. Deferred to the next session for detailed exploration, which is where the PAT-vs-GitHub-App choice and the conflict-surfacing path get settled. Scheduled polling is rejected outright on the 60-day auto-disable. A hosted webhook receiver is rejected as too much mechanism under the SIMPLE + ROBUST constraint. Scope boundary that survives either invoker: this covers only the MECHANICAL advance. The CI-to-green loop (0067) needs judgment about why a test failed, and a parked unit has no forge event to fire on, so both continue to wait for a human - the workflow makes shipping continuous, not autonomous, and must not be extended toward autonomy.
