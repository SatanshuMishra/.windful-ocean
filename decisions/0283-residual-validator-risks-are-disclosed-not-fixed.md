---
Status: accepted
Date: 2026-08-07T21:23:57.631Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0283. Three residual validator weaknesses are disclosed in the invariant record rather than fixed

## Context

Two security passes and one code review produced eleven findings against the release validator. The CRITICAL (python3 -c putting the inherited working directory on sys.path, so a repo-local ast.py executed during validation and the python gate silently passed), the HIGH, and every MEDIUM were fixed. Three findings remained, and the honest options were to fix them, drop them, or disclose them. Dropping is what turns a review into theatre; fixing everything indefinitely is how this thread previously burned five consecutive rounds that each cleared a finding list and broke something unnamed.

## Options

- Disclose all three in docs/invariants/coverage/fix-config-release-validation.json with the reachability argument that justifies deferring each, and fix nothing further in this phase - ADOPTED
- Fix all three now. Rejected: each is LOW, the code path still has no production caller, and a fourth round on a converged diff is exactly the pattern that has repeatedly introduced new defects here
- Leave them unrecorded and reopen if they ever bite. Rejected: an undisclosed known weakness in the gate that authorizes swapping global config live is not a risk anyone can weigh later

## Outcome

Adopted 2026-08-07. The three: (1) hookRegistrations silently drops malformed registrations, so a number, an array, a whitespace-only command or a cmd key yields zero registrations and zero failures — deferred because it needs malformed entries written into the live settings.json, outside the hostile-commit threat model, since a commit controls release content and not live settings. Note the related CRASH on a non-array hooks value WAS fixed, because that threw a raw TypeError out of promote. (2) checkerEnvironment passes PATH through, so an attacker-writable ABSOLUTE PATH entry hijacks every checker — deferred because anyone who can write to a directory on the user's PATH already controls every command the user runs, including the hooks themselves; relative PATH entries are already neutralised by the per-validation sandbox cwd. Pinning PATH was also rejected as actively risky, since the rehearsal showed PATH is what selects the homebrew python3 the hooks actually run under rather than /usr/bin/python3. (3) A same-user rename race on a resolved path between realpathSync and the spawn — unavoidable without fd-based checking that Node does not expose, and it presupposes an already-executing local process. Revisit (1) and (2) before converge.mjs is registered as a SessionStart hook, because that registration is what turns the drift report into an injection sink into every session.
