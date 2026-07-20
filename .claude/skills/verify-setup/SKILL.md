---
name: verify-setup
description: Use when a project has no /verify-<project> command and the user asks to set up scoped verification (or verification-discipline suggests it). Inspects the project's build system, discovers native scoped runners, and writes the project-local /verify-<project> slash command with a glob routing table. Run once per project; idempotent.
---

# Verify Setup

Generates the project-local scoped verification command that `verification-discipline` and the `verification-strategist` agent expect.

## Process

1. Detect the project:
   - Project name: package.json `name` field, else pyproject.toml `[project] name`, else Cargo.toml `[package] name`, else the repo directory name. Strip scope prefixes (`@org/app` → `app`).
   - Build system: check for `turbo.json`, `nx.json`, `package.json` workspaces, `vitest.config.*`, `jest.config.*`, `playwright.config.*`, `pyproject.toml`/`pytest.ini`, `Cargo.toml`, `Makefile`, and the `scripts` and `devDependencies` fields of `package.json` (runners such as vitest or jest are often present with no config file).

2. Discover native scoped capabilities, preferring what already exists. In priority order per ecosystem:
   - turbo: `turbo run <task> --filter=<pkg>` for each workspace task
   - Nx: `nx affected -t <task>`
   - vitest: `vitest run --changed <ref>` and `vitest related <files>`
   - jest: `jest --findRelatedTests <files>`
   - pytest: `pytest --testmon` if installed, else `pytest <path> -k <expr>`
   - cargo: `cargo test -p <crate>`
   - Plus always: the project's typecheck command and per-file lint command.
   Never invent scripts: only emit commands whose binaries/scripts exist in the project.

3. Build two tables:
   - Glob routing table: maps source globs to scope names (e.g. `src/auth/**` → `auth`, `packages/api/**` → `api`). Derive areas from workspace packages, top-level src directories, and test directory structure.
   - Scope command table: maps each scope name to the exact command(s), plus `typecheck`, `lint`, and `full` for each of those whose command exists in the project; omit any that do not exist rather than inventing them.

4. Write `<project>/.claude/commands/verify-<project>.md` using the output template below.

5. Validate: run each of the `typecheck` and `lint` scopes that was emitted, and one cheap unit scope. Record measured runtimes in the scope table. If a command fails, keep its row but annotate it `BROKEN: <error summary>` and report it; never silently drop a scope.

6. Report: list created scopes, measured runtimes, and gaps (areas with no runner found).

## Output template

The generated file must contain a glob routing table (the `verification-strategist` agent matches touched files against these globs) and a scope command table:

    ---
    name: verify-<project>
    description: Scoped verification for <project>. Usage: /verify-<project> <scope>[,<scope>] or /verify-<project> full
    ---

    # Verify <project>

    Run the command for each requested scope. `full` is reserved for integration boundaries and pre-push.

    ## Routing table

    | Glob | Scope |
    |---|---|
    | src/auth/** | auth |
    | packages/api/** | api |
    | *.md, docs/** | skip |

    ## Scopes

    | Scope | Command | Runtime |
    |---|---|---|
    | typecheck | npx tsc --noEmit | 4s |
    | lint | npx eslint <touched files> | 2s |
    | auth | npx vitest run src/auth | 6s |
    | full | npm run lint && npm run build && npm test | 4m |

## Error handling

- No recognizable runner: write a minimal command with only `typecheck`, `lint`, and `full` scopes, plus a `## TODO` section naming what could not be discovered. Tell the user.
- Heterogeneous monorepo: one routing table; scope commands may differ per workspace.
- Re-run on an existing command: regenerate tables, preserve any rows the user added manually (rows marked with `keep` in a trailing column).

## Boundaries

- Never connect to databases or deployed environments (global no-direct-db-access rule).
- Never modify package.json or project source; the only file written is the verify command.
