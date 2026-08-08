---
Status: accepted
Date: 2026-08-08T04:48:46.219Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0291. Promotion applies the reconciled settings.json to live, because the withdrawal set 0288 adopted is inert without it

## Context

0288 adopted a withdrawal set consulted by resolvePermissions so that promotion subtracts stale grants from live, and required a test proving the subtraction survives a promotion rather than merely asserting a constant contains a string. Measured this session against main a302e4c: resolveSettings (manifest.mjs:154) and resolvePermissions (:93) have ZERO production callers. resolvePermissions is called only by resolveSettings; resolveSettings is called only by manifest.test.mjs. promote.mjs never imports manifest.mjs at all - it reads live settings.json solely to validate hook registrations (promote.mjs:102) and never writes it back. capture.mjs consumes NOT_ADOPTED_GRANTS and UNIONED_SECTIONS but hand-duplicates the resolution logic for the opposite direction. So the ownership manifest that criterion c4 records as implemented is implemented as a library with no consumer. Two further consequences follow from the same gap: SPEC acceptance criterion 8 (settings.json survives promotion with live-owned keys intact and repo-owned keys applied) is unbuilt, and the repo's converge registrations at .claude/settings.json:110 and :174 have never reached live - live settings.json contains no converge registration today, which is why criterion c3 is still open.

## Options

- Wire resolveSettings into promote(): read declared settings from git show <sha>:.claude/settings.json in repoRoot, reconcile against live, validate the candidate using the RECONCILED registrations, swap, then write live settings.json atomically only if the bytes differ - ADOPTED
- Add the withdrawal set and defer the promote wiring to a later unit. Rejected: it ships a constant nothing consults, which is exactly the weaker assertion 0288 named and refused
- Delete the stale grant from live by hand during the cutover session. Rejected by 0288 already, because permissions.allow is unioned at manifest.mjs:28, so a hand-deleted grant returns through any later permission prompt and then survives every future promotion
- Read the declared settings from the repoRoot working tree instead of from the promoted sha. Rejected: the working tree sits on an arbitrary branch - the primary checkout is 64 commits behind main on another thread's branch - so it would promote settings that are not the sha being promoted

## Outcome

Adopted. Promotion becomes the mechanism that applies repo-owned settings keys to live, and the withdrawal set becomes reachable. settings.json is still never inside a release: the declared document is read out of git at the promoted sha and reconciled in memory, so release.mjs stripSettings stays true and 0287 is untouched.

One ordering rule this locks in, and it is the part that is easy to get wrong: validation runs against the RECONCILED registrations, not the current live ones. Promotion is about to change the hook registrations, so validating the pre-change set would validate a set that is never applied and apply a set that was never validated. A reconciled registration that does not resolve inside the candidate must reject the candidate with live left byte-identical.

This also closes c3 as a side effect rather than as separate work. The converge registration reaches live through the same promotion that the cutover session runs anyway, so it is applied inside the serialized window rather than being hand-edited into a live file or left inert in the interval - which is what 0286 asked for. Scope note: this makes the cutover unit larger than the three changes 0286 enumerated, and the growth is accepted rather than deferred, because 0288 and criterion 8 both terminate here.
