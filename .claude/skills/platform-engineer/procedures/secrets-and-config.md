# Secrets, credentials and environment-specific values

Every artifact you author is committed and readable forever by everyone with repository access. Treat it that way.

## 1. The placement rule

A secret is never a literal in any file you write. It is referenced.

- Reference an environment variable, or the project's secret manager, or the pipeline's secret store, using whatever indirection the project already uses.
- Validate at startup that every required secret is present, and fail immediately and loudly when one is missing. A service that starts without its credential and fails later under load is harder to diagnose than one that refuses to start.
- Keep non-secret, environment-specific values - hostnames, region names, bucket names, feature flags - in configuration rather than hardcoded, but do not promote them into the secret store; that makes them harder to review for no gain.
- A default value is only acceptable when it is safe in production. Never default a credential, and never default a destination that would silently point at the wrong environment.

## 2. What counts as a secret

Anything that grants access or identifies a principal: passwords, API keys, tokens, private keys, certificates with their keys, connection strings including their host and user portions, webhook URLs carrying an embedded token, and session or signing secrets.

A connection string is a secret in full. Splitting it into parts and inlining the harmless-looking half is still a leak, because the half you kept usually identifies the environment.

## 3. If you find one already committed

Stop the task you were on and say so first. Then, in the hand-back:

- Name the file and line, and say what kind of credential it is - never quote the value itself into your response, a log, an issue, or a commit message.
- State that removing it from the working tree does not remove it from history, so it must be treated as exposed.
- Give the human the two steps in order: rotate the credential at its source, then purge or accept the history.
- Note whether the same value appears elsewhere, since a leaked credential is usually copied.

Rotation is a human action at the credential's own provider. You never rotate, revoke, or issue a credential yourself.

## 4. What you never do here

- Write, read back, echo, or log a real credential value.
- Move a secret from one file into another file in the same repository and call it fixed.
- Add a credential to a test fixture, an example file, or a comment, including a real value marked as expired.
- Configure a service to read a credential from a location the project does not already treat as a secret store.

## 5. Return

Hand back per `procedures/handback.md`: the referenced names you introduced, where the human must set each value, and any exposure found, described without its value.
