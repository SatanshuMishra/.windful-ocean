---
Status: accepted
Date: 2026-08-06T21:27:48.839Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0275. The workflow fan-out boundary is any write to a live-linked path, not the cutover alone

## Context

0274 established that a small dynamic workflow implements SPEC A with the cutover serial. The user confirmed the serial cutover on 2026-08-06 and clarified that workflow should be used wherever possible AND appropriate, which required deciding where "appropriate" actually ends. Measuring that boundary falsified the claim in 0274's outcome that SPEC A section 7's five preconditions are independent and parallelize cleanly. Two findings. FILE CONTENTION: the ignore rules the preconditions must change are spread across two files, and preconditions 1 and 2 collide. Root .gitignore carries /.claude/docs/analysis/ at :12 and the unanchored *session* at :19; .claude/.gitignore separately carries notes/ and docs/superpowers/. Closing the coverage gap edits both files; narrowing *session* edits the root file; run concurrently they conflict on the root .gitignore. Root .gitignore:15-16 already carry the narrower *claude-session* and *claude_session*, so narrowing :19 must not un-ignore what those two do not cover. LIVE-LINKED WRITES: precondition 3, relocating generated output, edits .claude/hooks/graphify-provision.sh, graphify-common.sh and graphify-refresh.sh - three files reached through the 26 per-file hook symlinks, so a half-saved edit breaks every running session instantly. That is the same hot-swap hazard as the cutover, at smaller scale, and it sits inside the precondition set that 0274 described as safe to fan out. By contrast ~/.claude/local/ is absent today and ~/.claude/rules is a real directory rather than a link, so the bootstrap placement and the context7.md adoption are genuinely repo-only writes that reach no running session.

## Options

- Draw the fan-out boundary at live-linked writes: units that touch no live-linked path fan out concurrently; units that write .claude/hooks/, live settings.json, or perform the cutover run serially; units contending on the same file are fused or ordered. Keeps the workflow on the majority of the work while every hot-swap write stays single-threaded.
- Keep 0274's boundary - fan out all five preconditions, serialize only the cutover. Simplest to express, but it is now measurably wrong: it fans out three live hook edits and lets two units collide on root .gitignore.
- Serialize everything that touches the repository at all and use the workflow only for read-only analysis. Maximally safe and forfeits the efficiency the user asked for, since the bootstrap, promote verb, ownership manifest and context7.md adoption reach no running session and carry no hot-swap risk.
- Fan out everything including the cutover and rely on validation to catch damage. Rejected: the user confirmed the serial cutover, and validation runs before the pointer swap, not before a half-written live hook.

## Outcome

Chosen on 2026-08-06 per the user's clarification that workflow is used where possible and appropriate with the cutover serial. Option 1: the boundary is any write to a live-linked path, which is a strictly larger set than the cutover.

This supplements 0274 rather than reversing it; 0274's core - a small dynamic workflow, serial cutover - is confirmed and stands. What changes is the claim that the five preconditions parallelize cleanly, which measurement falsified.

Three bands govern the workflow. FAN OUT, no live-linked write and no shared file: place the bootstrap under ~/.claude/local/ (absent today), adopt rules/context7.md (~/.claude/rules is a real directory, so the repo write reaches no session), author the promote verb with its validation, rollback and LIVE receipt, and author the settings.json ownership manifest and capture verb. SERIALIZE, live-linked write: relocating generated output out of the graphify hooks, and registering the SessionStart and Stop converge hooks in live settings.json. SERIALIZE AND ALONE: the cutover, last.

Two ordering constraints inside the fan-out band. The coverage-gap closure and the *session* narrowing both edit root .gitignore and are therefore one unit, not two, with the narrowing applied before any adoption of a path the pattern hides. And narrowing :19 must preserve what :15-16 already cover.

The efficiency claim is bounded and should not be overstated: the fan-out band is roughly four units of authoring work, so the workflow buys concurrency on authoring, not on the hazardous writes, which were always going to be serial.
