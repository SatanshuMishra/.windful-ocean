---
Status: accepted
Date: 2026-08-14T03:39:44.827Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0411. The governed unattended launcher is struck; only a convenience wrapper survives

## Context

c14 required a version-controlled script to be the SOLE entry point for unattended runs, hardcoding the permission mode and passing through no caller settings, in order to close the argv channel found in M42-M44: --settings accepts inline JSON, deep-merges rather than replacing, outranks project and local settings, and is governed by nothing in the promotion pipeline - not review, not the PR gate, not promote. The flaw is that the launcher governs only the callers who choose to run it. Anyone who can run the launcher can instead type claude with their own flags, so nothing makes it the sole entry point. The only mechanism that could actually enforce sole-entry is a machine-level managed policy outside the repository, which is the containment approach 0407 removed. c14 was also the standing blocker on c3, the criterion carrying the thread's actual goal.

## Options

- Build c14 as specified: a governed launcher plus a rule making it mandatory
- Strike c14 entirely and type the unattended flags by hand each run
- Strike the governance framing and keep a plain convenience wrapper carrying the known-good invocation

## Outcome

Struck on the user's explicit instruction. The governance half is ceremony that changes nothing reachable - the same failure mode as the sandbox, the audit log and the PreToolUse gate that 0407 removed - so c14 joins c6, c7 and c8 as struck. The convenience half survives as a footnote to c3/c4 rather than a criterion: a small scripts/unattended.sh may capture the known-good invocation (the -p flag, --permission-mode bypassPermissions, and the session-scoped --settings profile disabling logbook@logbook) so the three fiddly parts are not retyped at the start of an unattended run, but it carries no governance claim and no rule making its use mandatory. The argv channel is accepted as open and unclosable by anything this repository owns. Striking c14 clears the standing blocker on c3.
