---
Status: accepted
Date: 2026-08-24T18:54:24.605Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0717. The plugin-load proof drops the isolation flag and identifies the plugin by path, with an empty-directory control

## Context

The plugin unit's SPEC-verbatim criterion mandates the minimal-mode flag, whose own help states that Anthropic auth becomes strictly an API key or a key helper and that OAuth and the keychain are never read. An API key is not permitted on this project. Pointing the configuration directory at an empty path was measured as an alternative and isolates correctly, with an empty plugin list and no plugin errors, but the session reports not being logged in, because the account record resolves through that directory even though the credential itself sits in the system keychain. Configuration isolation and subscription authentication therefore cannot be held at once by any flag available here.

## Options

- Run this one unit against an API key and record the departure
- Drop the flag and identify the plugin by its load path, with an empty-directory negative control
- Restate the criterion as a name check and accept that ambient state can satisfy it

## Outcome

The flag is dropped and the proof is rebuilt around identification rather than isolation. Measured on this machine: a directory load succeeds on the subscription, and every entry in the init event carries a name, a path, a source and a version, with a directory-loaded plugin uniquely marked by a source suffix and a path equal to the directory passed. The assertion now requires exactly that entry, compared by resolved path, and halts when no directory-loaded plugin appears at all rather than reporting a pass over an empty list. A second session runs with the plugin directory pointed at an empty temporary directory and its assertion must fail. That control is what the isolation flag was really buying, and it buys more: isolation is an assumption about the environment, while the control observes the dependency directly, and it closes a hole the flag never addressed, since the host repository ships a skill of the same name and a name-only assertion can pass on ambient state alone. Recorded as a documented departure from a SPEC-verbatim criterion, not a silent rewrite.
