# Getting facts that only a live database holds

Sometimes the reasoning genuinely needs live data: a row count that decides whether a backfill can run in one statement, a query plan that decides whether an index is worth adding, or the current state of a schema that the committed artifacts do not pin.

For structure - tables, columns, constraints, indexes, policies, functions, grants - you may read it yourself through the structure-reader login below. For anything else - a row count, a query plan over real data, any row - you still do not connect: you author the query and a human runs it.

## The paste cycle

1. Write the exact SQL you need - the `EXPLAIN`, the `SELECT`, the catalog query - into a fenced block in your response, or into a file when it is long enough to be worth keeping.
2. State plainly what you will do with each possible answer, so the human knows the round trip is worth making and can spot a question that does not need asking.
3. The human runs it in the dashboard and pastes the result back.
4. You reason over the pasted result.

That adds one round trip. The round trip is the point: it keeps the dashboard the single record of what ran, and it keeps every read of production behind a deliberate human action.

Ask for the smallest thing that answers the question. Never ask for a dump of user data, and never ask for a query whose result you do not need in order to decide something specific. If a question can be answered from committed artifacts instead, answer it from those and skip the cycle.

## The one carve-out, and its exact edges

A local, disposable container used only for tests is exempt. That means the project's own local development stack, running on localhost in a throwaway container, seeded with synthetic data, and destroyed after the run. Starting it, resetting it, and running the project's database tests against it are permitted.

The carve-out reaches nothing else. Every hosted, staging, or production project stays human-applied, and is agent-connected only through the structure-reader login, for structure. Any command that targets a remote project - push, pull, a migration applied upstream, a function deployed - remains prohibited regardless of which container is running locally. A remote connection string is not made acceptable by the presence of a local one.

Before using the carve-out, confirm three things and say so in your hand-back: the target is localhost, the data is synthetic, and the container is disposable. If you cannot confirm all three, use the paste cycle instead.

## The structure-reader login

A human creates it once per project, in that project's SQL editor, with a generated password:

```sql
CREATE ROLE claude_structure_reader LOGIN PASSWORD '<generated>' NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
ALTER ROLE claude_structure_reader SET default_transaction_read_only = on;
ALTER ROLE claude_structure_reader SET statement_timeout = '15s';
ALTER ROLE claude_structure_reader SET idle_in_transaction_session_timeout = '30s';
```

The human then runs this check, which must return no rows. Each row is something the login could read or change beyond structure, and is closed before the login is used:

```sql
SELECT 'can select ' || n.nspname || '.' || c.relname AS gap
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND has_table_privilege('claude_structure_reader', c.oid, 'SELECT')
UNION ALL
SELECT 'can create in ' || n.nspname FROM pg_namespace n WHERE has_schema_privilege('claude_structure_reader', n.oid, 'CREATE')
UNION ALL
SELECT 'member of ' || r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = 'claude_structure_reader'::regrole;
```

The human puts the connection in a `~/.pg_service.conf` entry named for the project, with the password in `~/.pgpass` at mode 600. You connect with `PGOPTIONS='-c default_transaction_read_only=on' psql "service=<name>" -X -v ON_ERROR_STOP=1`, never with a connection string on the command line, and you never read either file.

## Reporting an unknown

If the human does not run the query, the fact stays unknown. Say the fact is unknown and state what you assumed in its absence. Do not infer a row count from a file, do not estimate a query plan, and do not describe a schema you have not read. An assumption labelled as an assumption is usable; one presented as a measurement is not.
