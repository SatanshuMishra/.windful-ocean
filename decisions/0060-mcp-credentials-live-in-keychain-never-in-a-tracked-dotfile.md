---
Status: accepted
Date: 2026-07-28T03:59:00.654Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0060. MCP credentials live in macOS Keychain and reach config only as an env-var placeholder

## Context

Authenticating the GitHub MCP server needed a PAT, because the server does not support dynamic client registration and so cannot complete the OAuth flow. The obvious place to put it - an export line in ~/.zshrc - turned out to be actively dangerous here: ~/.zshrc is a symlink to <repo>/.zshrc, which is tracked, not gitignored, and pushed to a GitHub remote. The same is true of ~/.claude/settings.json, ~/.claude/lib, ~/.claude/workflows and every ~/.claude/hooks/* entry. A secret written to any of them looks like private local config but is really a pending change to a tracked file, one `git add -A` from publication. This was not hypothetical: a PAT was pasted into ~/.zshrc during this session and was caught only because a stray bare line made zsh throw "command not found". It never reached a commit and was rotated.

## Options

- Keychain-backed env var: store the secret with `security add-generic-password`, have .zshrc export it via $(security find-generic-password ... -w), and reference only ${VAR} in the MCP config - no file on disk holds the secret, and both the .zshrc line and the MCP entry stay committable
- Literal token in ~/.claude.json - untracked, but plaintext on disk and easy to leak through any config dump or diagnostic
- Literal export in ~/.zshrc - rejected outright, since that file is tracked and pushed
- Untracked secrets file outside the repo, sourced from .zshrc with a guard - safe, but leaves a plaintext secret on disk and adds a file whose absence fails silently

## Outcome

Chosen: Keychain-backed env var. The PAT is stored under service name github-mcp-pat, .zshrc exports GITHUB_MCP_PAT from it via command substitution, and the server is registered at user scope with header "Authorization: Bearer ${GITHUB_MCP_PAT}". Verified the variable resolves in a login shell and that ~/.claude.json stores the placeholder rather than a literal - the single quotes on `claude mcp add -H` are load-bearing, since double quotes would expand the variable at registration time and write the raw token into the config. Generalizes beyond this server: no credential goes into ~/.zshrc or anything under ~/.claude, and before writing a credential to any dotfile, check whether its realpath lands inside a repo. Open caveat: ${VAR} expansion is documented for .mcp.json but was NOT confirmed for user-scope ~/.claude.json; if auth fails after restart, the fallback is a project .mcp.json carrying the identical placeholder, which is safe to commit.
