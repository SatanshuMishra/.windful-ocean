# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **Stop**: When session ends (final verification)

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Entering `bypassPermissions` mode is denied by default; it is permitted only where layers 0, 1 and 4 are live and the layer 4 heartbeat asserts them at session start. An unasserted layer counts as absent
- The gate is the mode, not the spelling — it covers every door into it:
  - `--dangerously-skip-permissions`
  - `--permission-mode bypassPermissions`, the same mechanism under a second name
  - `permissions.defaultMode: "bypassPermissions"` in any settings file, project settings included
  - `--settings` carrying inline JSON with that key — it deep-merges, outranks project and local settings, and never touches a committed file
  - `--allow-dangerously-skip-permissions`, the weaker unlock that feeds the interactive mode cycle into the two flags above
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements
