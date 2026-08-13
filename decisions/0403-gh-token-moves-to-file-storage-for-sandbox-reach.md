---
Status: accepted
Date: 2026-08-13T22:15:49.373Z
Thread-Id: 01KZY5ARMRK0S390J8Y25X8Z72
---

# 0403. The gh token moves from Keychain to file storage so the sandbox can read it

## Context

Layer 0 blocks ~/Library/Keychains, where gh stores its token, so no agent shell could authenticate and every push and pr-create failed. A terminal `export GH_TOKEN` does not help: the harness starts a fresh shell from the profile, so the variable never crosses over. ~/.zshrc is tracked in this repo, so a token can never be exported from there.

## Options

- Export GH_TOKEN from the shell profile - refused, ~/.zshrc is tracked and the token would enter git
- Put the token in settings.json or settings.local.json env - plaintext secret in or beside a tracked file
- gh auth login --insecure-storage, writing the token to ~/.config/gh/hosts.yml at 0600, with the sandbox granted read on ~/.config/gh
- Grant the sandbox Keychain access - reopens the exfiltration surface Layer 0 exists to close

## Outcome

Chose file storage. GH_TOKEN had to be unset first, since gh refuses to overwrite stored credentials while the variable shadows them. The credential helper is scoped to github.com via `gh auth setup-git`, NOT `--replace-all`, which would have stripped osxkeychain and GCM for every other host. This restores `git push` only; gh's API stays dead because its TLS verification, not its token lookup, is what the sandbox breaks.
