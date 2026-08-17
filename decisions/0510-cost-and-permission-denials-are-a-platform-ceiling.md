---
Status: accepted
Date: 2026-08-17T06:18:15.835Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0510. Cost and permission_denials are unreachable from hooks, so the prose is wrong and they are not fields

## Context

The SPEC lists five gaps the source report leaves open. The fifth is that cost and permission_denials are named in the engine-adapter prose but are absent from the record table, and the report does not say which is right. A read-only survey settled it three ways: the design document itself states hooks expose no token data and puts full cost telemetry out of scope; neither field appears in that document's own event tables; and static inspection of the shipping Claude Code binary at version 2.1.233 shows total_cost_usd, num_turns, duration_ms, duration_api_ms and permission_denials appearing together as fields of the Agent SDK's internal end-of-turn result message, a schema family confirmed absent from every hook input including Stop, SubagentStop, SubagentStart, PreToolUse and PermissionDenied. A hooks script receives one JSON object on stdin per firing and never sees that channel.

## Options

- Add cost and permission_denials as observer record fields
- Treat both as a hard platform ceiling and strike them from the contract
- Recover them by having the observer shell out to a second source

## Outcome

Treat both as a hard platform ceiling. The engine-adapter prose is wrong, not the field table, so neither becomes a field in the rebuilt observer's record. This is a structural limit of the hook channel rather than an unimplemented item, so it is not carried as a to-do and no unit is expected to close it. A future observer that wants either would have to be driven from the Agent SDK's query API instead of from a hooks script, which is a different architecture and out of scope here.
