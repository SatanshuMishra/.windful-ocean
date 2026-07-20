# Glossary — plain-language definitions

The synthesis step attaches these as hover tooltips on each term's FIRST appearance in the hub.
Keep each definition to one sentence, jargon-free. Verify the named thing still exists in the live
inventory before asserting specifics.

- **Skill** — a saved procedure (a Markdown file) that Claude loads and follows step-by-step when a matching task appears; think "a playbook for one kind of work".
- **Agent / subagent** — a separate Claude worker spun up with a fresh, empty memory to do one scoped job and report back, so the main conversation stays uncluttered.
- **Orchestrator** — the main Claude in your session; it routes and reviews work but delegates the actual doing to subagents.
- **Rule** — an always-on instruction (in CLAUDE.md or `rules/`) that constrains how Claude behaves in every task, no invocation needed.
- **Hook** — a small script the system runs automatically at a fixed moment (a "lifecycle event") to check, block, or react to what Claude is doing.
- **Lifecycle event** — a named moment in a session when hooks may fire: session start, before a tool runs, after a tool runs, when Claude stops, or on a notification.
- **Plugin** — an installable bundle that adds capabilities (skills, commands, agents, or tool servers) to Claude, downloaded from a "marketplace".
- **Marketplace** — a catalog/source that plugins are installed from.
- **MCP (Model Context Protocol)** — a standard way for Claude to talk to an external tool or service (a browser, a code-navigation server, GitHub) through a small connector program called an "MCP server".
- **MCP server** — the connector program that exposes one external service's abilities to Claude as tools.
- **Slash command** — a shortcut you type starting with `/` that triggers a saved prompt or skill.
- **Frontmatter** — the small block of settings fenced by `---` at the top of a Markdown file (name, description, etc.) that tools read to understand the file.
- **Tool** — a single action Claude can take (read a file, run a shell command, edit code); tools are what hooks gate and what agents are granted.
- **Memory (auto-memory)** — durable per-project notes Claude keeps so a later session remembers decisions that aren't written in the code.
- **Continuity ledger** — per-project files that teach the next session the cumulative state of the work (what's decided, what's in progress).
- **graphify** — a locally-built "map" of a codebase (a knowledge graph) Claude queries to orient itself before drilling in.
- **Serena** — an MCP server for precise code navigation (find every caller, every implementation) and symbol-level edits.
- **Effort level** — a setting that tunes how much reasoning the model spends per turn.
- **Permissions (allow / deny / ask)** — rules deciding which tool actions run automatically, which are blocked, and which prompt you first.
- **Statusline** — the custom info bar shown at the bottom of the session.
- **TDD (test-driven development)** — write a failing test first, then the code to make it pass.
- **Drill-down** — opening one subsystem or flow in greater depth than the overview.
