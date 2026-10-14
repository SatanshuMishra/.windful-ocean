# Live Databases: Read Structure Only

Claude may connect to a live, hosted, staging or production database for one purpose: reading its structure. Every change is still authored as SQL and applied by a human, and that paste cycle remains the audit trail for anything that writes or reads rows.

## The login decides

Connect only through the structure-reader login a human created for this, reached through a `~/.pg_service.conf` entry whose password lives in `~/.pgpass`. Postgres itself must make writes and private rows unreachable for it: it holds no privilege on any table, view, sequence or column outside `pg_catalog` and `information_schema`, belongs to no other role, has `CREATE` on no schema, is `NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, and carries `default_transaction_read_only = on` and a short `statement_timeout`.

Refuse every other credential, whatever it is called and whoever offers it: `postgres`, `service_role`, `supabase_admin`, a service-role or secret key, a pasted connection string, or a read-only login that can select table rows. Read-only is not the test. Structure-only is.

## What a session may do

Start every session with `PGOPTIONS='-c default_transaction_read_only=on'`, run each batch inside `BEGIN READ ONLY` and end it with `ROLLBACK`, and never turn read-only off. Run only `SELECT` and `SHOW` against `pg_catalog`, `information_schema` and the catalog functions (`pg_get_functiondef`, `pg_get_viewdef`, `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `pg_get_expr`, `pg_get_userbyid`, `has_*_privilege`, `to_regclass`, `to_regprocedure`). The repository's census and preflight queries qualify where they read only those. Copying the structure read this way into a local disposable container, to probe or test against it, is allowed.

## What stays forbidden

- Anything that writes or changes state: `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `COPY`, `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `COMMENT`, `SECURITY LABEL`, `VACUUM`, `ANALYZE`, `REFRESH`, `CLUSTER`, `REINDEX`, `LOCK`, `CALL`, `DO`, `SET ROLE`, `SET SESSION AUTHORIZATION`, and `EXPLAIN ANALYZE`, which runs its query.
- Reading rows, counts included: nothing from an application table, view or materialized view, nothing from the `auth`, `storage`, `vault`, `realtime`, `net`, `cron` or `supabase_*` schemas, and no `count(*)` (use `pg_class.reltuples`). No call to any application function, since a `SECURITY DEFINER` function can return private data or write. No `pg_dump`, no storage download. A question that needs row data becomes a query a human runs.
- Applying anything: migrations, `supabase db push`, `migration up`, `db pull`, `functions deploy`, `supabase login`, `link`, `projects` or `secrets`, and installing or invoking any MCP server or other persistent tool that can connect to a database.
- Printing, storing or committing a password or connection string, or reading `~/.pgpass` or `~/.pg_service.conf`.

If a structure read fails with a permission error, report it and stop. Do not look for another way in.

A local, disposable container holding synthetic data is not a live database; this rule does not cover it.

Creating the login, and authoring migrations, rollbacks and live-fact queries, is the `platform-engineer` skill.
