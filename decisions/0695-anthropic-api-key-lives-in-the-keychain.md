---
Status: accepted
Date: 2026-08-24T03:43:59.195Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0695. The extraction runs claude --bare on a real API key, held in the Keychain and injected per command

## Context

Four units of the extraction call the claude CLI as a program rather than through a session, and the SPEC mandates --bare so a capture is reproducible on another machine. --bare never reads OAuth credentials or the system keychain, and ANTHROPIC_API_KEY was measured unset. Without it the contract capture, the plugin-load proof, the one contract dispatch and the fixture regeneration all fail, and the plugin-load proof is the gate protecting the working machine from a premature removal, so its absence blocks the entire host workstream. Two obvious ways to set it are both unsafe here: the shell config file is a symlink into a PUBLIC repository and is tracked, and history-space suppression is not enabled. A third hazard is unrelated to leaking: an exported key is visible to interactive Claude Code and bills subscription work against the API.

## Options

- Export a real key and keep --bare as specified
- Drop --bare and run on OAuth, accepting a capture that reflects local hooks, skills and plugins and a plugin-load assertion whose plugin_errors field carries unrelated errors
- Defer the four units, which stops the host workstream entirely

## Outcome

Option 1. The value is stored once in the macOS Keychain entered at a prompt so it never reaches argv or shell history, and injected for the lifetime of a single process by a helper function that contains no secret and is therefore safe to commit. It is never written into either repository, never exported into a shell that launches interactive Claude Code, and verified by exit code and cost field rather than by printing it. The same value reaches CI as a repository secret piped from the Keychain, set only after the repository exists.
