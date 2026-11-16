# Database gate threat model

Status: written 2026-10-15 with the gate. It governs changes to the gate the way `docs/security/bash-gate-threat-model.md` governs the Bash gate.

## 1. Scope

The gate is `.claude/hooks/db-gate.mjs`, a Node `PreToolUse` hook on every Bash and MCP call, with its tests in `.claude/hooks/tests/db-gate.test.mjs`. The policy it enforces is `~/.claude/rules/common/database-access.md`. The Bash gate (G1, G3) never asks; this gate owns every database decision.

## 2. Assurance level

Defense in depth, not a security boundary. The database's grants are the boundary for reads: the reader role sees no PII column and cannot write. The gate decides which commands reach a live database without a human: `ask` raises a permission prompt even in bypassPermissions mode and is refused in `claude -p`; `deny` is never approvable.

## 3. Adversary model

In scope: a mistaken agent, an overreaching agent, and a prompt-injected agent that launders a change through a wrapper, a chain, a package script or a make-style target. Out of scope: the machine owner, who holds a shell outside Claude Code.

## 4. Goals

| ID | Statement | Control |
|---|---|---|
| DG1 | Every database change asks. | Per-segment command-word matching after wrapper removal: database clients, restores, migration apply verbs, remote or unknown Supabase and Railway commands, package scripts, make-style targets, Railway MCP change tools, SQL-named MCP tools. |
| DG2 | Database credentials deny. | pg password and service files, `PGPASSFILE`, `PGSERVICEFILE` and `PGSYSCONFDIR` anywhere in the command, `railway variables` without a set, Railway credential MCP tools. |
| DG3 | Reader reads pass with no prompt. | A `<project>-reader` service the user's service file maps to `claude_reader`, no other connection setting or PG variable, and all SQL visible, free of read-only overrides and limited to allowlisted psql meta-commands. |
| DG4 | Faults deny. | Unparsable input, a malformed payload or a thrown error denies with a reason beginning `database gate fault`; the script always exits 0. |

## 5. Non-goals

- Full shell parsing and every equivalent spelling of a command, for the reasons of the Bash gate's non-goals 2 and 3: no parser has full bash fidelity, and a denylist cannot enumerate an open-ended category.
- sqlite files and other local single-file databases.
- Invoking deployed HTTP functions, such as an edge function called with curl.
- A local target the command does not name, such as a migration tool reading a local URL from a config file; such commands ask.

## 6. Accepted residual risks

| # | Risk |
|---|---|
| 1 | Quote insertion and variable indirection evade command-word matching. |
| 2 | A script or Makefile body the gate cannot read runs unexamined; only `package.json` scripts are read, three levels deep. |
| 3 | A loopback port forwarded to a live database, through an ssh or proxy tunnel, passes as a local target. |
| 4 | A docker context or `DOCKER_HOST` pointing at a remote engine makes `docker exec` reach a remote database. |
| 5 | A missing or unloadable gate file lets every call through, because Node hooks here are registered without `\|\| exit 2` (the lesson recorded in `docs/security/dotfiles-usability.md`). |
| 6 | Approval fatigue: a user who approves every prompt approves the change too. |
| 7 | The interactive prompt has been observed only through `claude -p`, not yet in the desktop app. |
| 8 | A migration against a local disposable database asks like any other, by non-goal 4, so an unattended session, where no one can answer, is refused it: a project whose test setup runs a migration tool on the host cannot set up its database there. What passes is `docker exec` into the container, and `prisma` with an inline loopback `DATABASE_URL`. Logged 2026-11-15. |

## 7. Definition of done

For any change to this gate, all four must hold:

1. Closes DG1 to DG4 against normal and mildly obfuscated phrasing.
2. Uncertainty fails toward `ask` for a change and `deny` for a fault, never toward silence.
3. Covered by the corpora in `.claude/hooks/tests/db-gate.test.mjs`, including the read corpora that must pass untouched.
4. A finding against a stated non-goal is logged in section 6, not fixed.
