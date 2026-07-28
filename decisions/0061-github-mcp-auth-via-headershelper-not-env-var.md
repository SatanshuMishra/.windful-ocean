---
Status: accepted
Date: 2026-07-28T04:31:31.884Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0061. GitHub MCP authenticates via headersHelper reading Keychain, not an environment variable

## Context

The github MCP server failed with HTTP 400 "Authorization header is badly formatted". The header was correctly placed in ~/.claude.json as "Bearer ${GITHUB_MCP_PAT}", and ${VAR} expansion IS documented as supported at user scope, so placement was never the fault. Two real faults: GITHUB_MCP_PAT was absent from the Claude Code process environment (docs specify the unexpanded ${VAR} text is then sent verbatim), and the Keychain item held the whole statement export GITHUB_MCP_PAT="github_pat_..." rather than a bare token - so the env-var path would have failed even once populated. The environment path is also fragile by construction: it only works when Claude Code is launched from a terminal that sourced .zshrc, and a Dock launch silently breaks it while placing a live PAT in the environment of every child process. Extends decision 0060, which put MCP credentials in Keychain and never in a tracked dotfile.

## Options

- Keep headers.Authorization with ${GITHUB_MCP_PAT} and rely on the .zshrc export - requires launching only from a terminal, and puts a live PAT in every child process environment
- Switch to headersHelper invoking security find-generic-password at connect time - no environment dependency, no secret in config, works under any launch method
- Move the server to a project-scoped .mcp.json with the same placeholder - was the planned fallback, but unnecessary once user-scope expansion was confirmed supported

## Outcome

Adopted headersHelper. ~/.claude.json mcpServers.github now carries headersHelper running security find-generic-password and emitting {"Authorization": "Bearer <token>"}, with headers removed and the URL aligned to the documented trailing-slash form. The helper was validated under env -i before being stored, proving it depends on no inherited environment. The Keychain item was corrected to hold the bare 93-character token. The now-redundant .zshrc export was removed, returning that tracked file to its committed state. Result: github connects, and connection survives with no GITHUB_MCP_PAT in the environment at all.
