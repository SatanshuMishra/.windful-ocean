---
Status: accepted
Date: 2026-08-13T18:06:38.419Z
Thread-Id: 01KZ0D32M5MRY6TY6XV55AD62A
---

# 0391. Run unattended in bypassPermissions, not auto mode, because auto mode silently skips work

## Context

Official documentation steers unattended operation toward auto mode: "For background safety checks with far fewer permission prompts, use auto mode instead." But two agents independently established from the permission-modes documentation that in a non-interactive run auto mode does not stall when the classifier blocks - "the action doesn't run and Claude keeps working... Claude Code doesn't stop the run." It fails the ACTION, not the session. Interactive auto mode instead resumes prompting after 3 consecutive or 20 total blocks, with thresholds documented as not configurable.

## Options

- Auto mode in headless, following the documented recommendation
- bypassPermissions with guards carried by deny rules and hooks
- Build a custom --permission-prompt-tool that answers prompts programmatically

## Outcome

Adopted bypassPermissions. The requirement is not \"no stalls\" but \"all tasks complete\", and auto mode's silent skip fails that requirement INVISIBLY - waking to a session that reports success while having quietly dropped steps is strictly worse than waking to a visible stall. The guard set survives this mode intact: deny rules and explicit ask rules are enforced in every mode, and a PreToolUse hook exit code 2 blocks in every mode, firing before any permission-mode check. What is given up is the classifier, the only intent-aware layer; deny rules and hook predicates are deterministic but blind to intent. This is the design's known weak point and was accepted knowingly. Two operational preconditions: bypassPermissions requires a one-time interactive acceptance dialog on the machine before any background session will start, and the ratification of R3 binds the mode to having the reversibility and observability layers live beneath it.
