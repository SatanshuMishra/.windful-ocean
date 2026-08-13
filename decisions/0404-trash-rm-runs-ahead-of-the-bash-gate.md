---
Status: accepted
Date: 2026-08-13T22:15:56.772Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0404. trash-rm registers ahead of the bash gate so the gate judges the rewritten command

## Context

Wiring Layer 1 required choosing matchers and an order. trash-rm.mjs emits hookSpecificOutput.updatedInput rewriting an rm call into a reversible trash call; the bash gate decides whether the command runs. If the gate sees the raw rm it blocks a call that would have been made safe, so Layer 1 never helps precisely where it matters most.

## Options

- trash-rm after the gate - the gate judges raw rm and blocks calls the rewrite would have made reversible
- trash-rm ahead of the gate - the gate judges the rewritten, reversible command
- Register both hooks on a .* matcher - checkpoints every Read at roughly 122ms, for no benefit
- Register via registrations.mjs - rejected, that module validates registrations and is not their source of truth

## Outcome

trash-rm.mjs sits first in the Bash matcher, ahead of block-destructive-bash.sh. checkpoint-worktree.mjs takes its own Edit|Write|NotebookEdit|Bash matcher, covering every mutating surface without paying the checkpoint cost on reads; it falls back to cwd when a payload carries no path field, which is what makes it work for Bash. Both hooks fail open and always exit 0, so neither can wedge a session. Ordering is safe whether or not the harness chains updatedInput between hooks in one event, which was not verified.
