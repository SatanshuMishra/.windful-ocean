# No Direct Database / Cloud-Admin Access

Claude must never connect directly to project databases or cloud-admin surfaces. The agent operates on static artifacts (committed SQL files, generated types, schema dumps). The human operates the live system. This is a CRITICAL cross-project rule, not a per-project preference.

## Hard Prohibitions

NEVER install, configure, or invoke:

- Supabase MCP server (`@supabase/mcp-server-supabase`)
- Postgres MCP servers (Postgres MCP Pro, pgEdge, Neon MCP, generic Postgres MCP)
- Any other MCP that connects to a project database or cloud admin/data plane
- `supabase` CLI commands against a remote project: `supabase db push`, `supabase migration up`, `supabase db pull`, `supabase functions deploy`, etc.
- Any tool that authenticates to a live cloud project on the user's behalf
- Any hook or subagent that would call the above

Even "read-only DSN" framing does NOT make this acceptable. The rule is **never connect**, not "never write."

## Migrations and Schema Changes

ALL migrations and schema changes follow this flow:

1. Claude authors a `.sql` file in the project's convention (typically `supabase/migrations/YYYYMMDD_<descriptive>.sql`)
2. Claude pairs it with a rollback file if the project requires one
3. The file is committed to the repository
4. **The human pastes the SQL into the Supabase dashboard (or equivalent) and runs it manually**
5. Claude is NEVER part of step 4

Pre-commit hooks and PostToolUse hooks may LINT or AUDIT the SQL statically. They MUST NOT apply it.

## Live Data Inspection (rule-compliant workflow)

When agent reasoning needs live data (query plans, row counts, current schema state):

1. Claude writes the EXPLAIN / SELECT / DESCRIBE SQL into a code block or `.sql` file
2. The human runs it in the dashboard
3. The human pastes the result back into the conversation
4. Claude reasons over the pasted result

This adds one paste-cycle. The cycle is the point — it preserves the audit trail.

## What Stays Allowed

These do NOT touch project databases and are NOT covered by this rule:

- GitHub MCP (external service, read-only scoped tokens)
- Playwright MCP (local browser automation)
- Context7 (public documentation)
- Serena (local code navigation)
- Linear, Slack, Figma, Sentry MCPs when in use (they touch their own services, not your DB)
- Local LSP servers (TypeScript, ESLint, Tailwind)

## Test-Only Local Disposable Container Exception (ratified 2026-07-06)

Exception for LOCAL, disposable Supabase CLI containers used ONLY for tests: the agent may run `supabase start`, `supabase db reset`, and pgTAP against a throwaway local container seeded with synthetic data. The hosted/staging/production project remains human-applied and is never agent-connected. The container holds no real data, is not an audit surface, and is destroyed after the run.

Scope guard: this permits ONLY local ephemeral containers (the Supabase CLI Docker stack on localhost). It grants NO reach to any hosted, staging, or production project, nor any remote DSN. `supabase db push`, `supabase migration up`, `supabase db pull`, `supabase functions deploy`, and every other command that targets a remote project remain prohibited. Ratified for an automated-testing-architecture initiative; applies wherever a local disposable test container is used.

## Why

- **Audit trail.** Dashboard is the single source of truth for "what ran in production." Agent-driven application breaks that.
- **Exfiltration containment.** A prompt-injected agent cannot exfiltrate via a DB tool that doesn't exist in its tool set.
- **Explicit human approval.** Every schema mutation requires conscious human action — no accidental migrations from a misinterpreted instruction.
- **Reversibility.** Static SQL files are reviewable, diffable, revertible in git. Agent-applied changes are not.
