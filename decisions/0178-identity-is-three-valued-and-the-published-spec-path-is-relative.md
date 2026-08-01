---
Status: accepted
Date: 2026-08-01T04:33:30.856Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0178. Identity is a three-value domain and the published spec path is repo-relative

## Context

Two smaller spec-3.5 deviations were ratified alongside 0176/0177. Spec 3.5 declares identity as a two-value union published|local-only, but a run that halts before the ref is ever probed has observed nothing. Separately, PUBLISHED_RUN_FIELDS carried spec as the engine-validated ABSOLUTE path, pushed to a shared remote - leaking the originating machine's home directory. The objection that fixing it needs a schemaVersion bump orphaning published refs proved vacuous: MANIFEST_REF_PREFIX is absent from origin/main, so no manifest ref has ever been published anywhere.

## Options

- Report local-only on a pre-probe halt
- Omit the identity field on halts that never probed
- Add a third value 'unresolved' for the pre-probe halt
- Keep the absolute spec path and bump schemaVersion later
- Make the path repo-relative now, keeping schemaVersion 1

## Outcome

identity is a THREE-value domain: published | local-only | unresolved. Reporting local-only on a halt that never probed the ref would INFER absence, which I4 forbids; omitting the field would silence the halt on exactly the question an operator asks first. Every report path carries the field. The published spec path becomes repo-relative POSIX with schemaVersion held at 1, since there is no backward-compatibility burden. The reader rejects a leading slash, any .. segment, a drive prefix, and a backslash - the backslash rule was added by the implementer beyond ratified scope, correctly, because a UNC path passes the three named checks and still leaks a machine path. Required companion, found by the same agent: resolveRunIdentity's envelope comparison had to move to repo-relative too, or a relative payload would report a permanent FALSE disagreement on every run.
