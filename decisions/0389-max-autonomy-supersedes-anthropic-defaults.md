---
Status: accepted
Date: 2026-08-13T18:06:13.978Z
Thread-Id: 01KZ0D32M5MRY6TY6XV55AD62A
---

# 0389. Unattended autonomy supersedes alignment with Anthropic's recommended permission defaults

## Context

The 2026-08-01 audit concluded the configuration was closely aligned with Anthropic's published recommendations for Claude Code. On 2026-08-13 the user superseded that goal: give the agent maximum freedom, place guards ONLY on the highest and most critical elements. The success test is behavioral - start a task, go to bed, wake to ALL tasks complete, with no stall waiting for permission. Stalls, not breakage, are the failure mode being optimized against: a gate that fires at 3am costs an entire night.

## Options

- Keep the Anthropic-aligned configuration and accept the prompting friction
- Maximum freedom with guards only on genuinely unrecoverable operations
- Remove all guards and rely on isolation alone

## Outcome

Adopted maximum freedom with a minimal guard set. Consequence for all future work: do NOT cite \"Anthropic recommends X\" as a reason to keep a guard - that argument is spent on this thread. A guard is justified only by showing the operation is genuinely unrecoverable AND its effects escape the repository. Prefer converting a gate into reversibility (snapshot, checkpoint, worktree isolation) over keeping the gate. Standing-rule dispositions ruled the same day: no-direct-DB-access KEEPS unchanged (authoring migration SQL for the user to apply by hand is not a blocker); centralized PR creation KEEPS unchanged (its purpose is uniform PR structure, not safety); destructive-git confirmation NARROWS so routine destructive git such as worktree cleanup runs unattended; the --dangerously-skip-permissions prohibition is LIFTED, replaced by a precondition that the reversibility and observability layers be live first.
