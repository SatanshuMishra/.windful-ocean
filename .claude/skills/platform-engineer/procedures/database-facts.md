# Reading a live database

Reads, audits and exports from a live database run without asking, through one path: the project's reader service. Everything that changes schema or data goes through the approval flow in `procedures/schema-migration.md`. The policy is `~/.claude/rules/common/database-access.md`.

## The reader service, and why it is the only automatic path

Each project gets a pg service named `<project>-reader`, for example `storefront-reader`, that logs in as the role `claude_reader`. The database itself keeps that role read-only and away from PII: it holds select on non-PII columns of the application's own tables and nothing else, so a mistaken or injected query can neither write nor return a private value. No other credential can promise that, which is why no other connection runs unprompted.

The one invocation the database gate passes with no prompt:

```
psql "service=<project>-reader" -X -c "<query>"
```

or the same with `-f <file>` naming a readable file in place of `-c`. Spell it exactly so: no `PG*` environment variable in front of it, no `-h`, `-U` or `-p`, and no psql meta-command or client escape in the query. The role's own defaults keep the session read-only, so nothing else is needed. Any other spelling raises a permission prompt.

Ask the smallest question that decides something specific, and never export a column the reader cannot already see. Credentials never enter the transcript: never print, paste or echo a password or a connection string.

## Setting it up once per project

A human runs this once per database; you never see the password.

1. The human edits the two placeholder blocks below, runs the setup block as the database owner, then runs the gap check and closes every row it returns.
2. The human adds a section `[<project>-reader]` to `~/.pg_service.conf` with `host`, `port`, `dbname`, `user=claude_reader` and `sslmode=require`. The gate trusts a reader service only when its user is `claude_reader`.
3. The human puts the password in `~/.pgpass` at mode 600.

You never read or write `~/.pg_service.conf` or `~/.pgpass`.

The placeholders, each replaced before running:

- `__APP_SCHEMAS__`: a comma-separated list of the application's own schemas; on Supabase normally `public` alone. System and platform schemas never go in it: `pg_catalog`, `information_schema`, `auth`, `storage`, `vault`, `realtime`, `net`, `cron`, `graphql`, `extensions`, `pgsodium`, and every schema whose name starts with `supabase_` or `pg_`. The setup refuses them and the gap check reports them.
- `__PII_COLUMNS__`: a comma-separated list of `schema.table.column`, from Declaring PII below.
- `__APP_ROLES__`: a comma-separated list of the roles the application calls functions as; for Supabase `anon`, `authenticated`, `service_role`.
- `__READER_PASSWORD__`: a generated password, typed by the human and kept out of every file and transcript.

The setup grants column-level select on ordinary and partitioned tables only, never on a view, materialized view or foreign table, because a view runs with its owner's rights and can expose a PII column under another name. The human may grant a reviewed PII-free view by hand, and the gap check then lists it so the grant stays deliberate. A table with row level security gets a select-only policy for the reader alone.

The setup also changes who may call every `SECURITY DEFINER` function in those schemas: it revokes execute from PUBLIC and grants it to each role in `__APP_ROLES__`. A reader can switch its read-only default off, and Postgres cannot withhold from one role what PUBLIC holds, so this is the only way to keep a writing function out of its reach. The human reviews the role list before running it, because a role left off it loses access to those functions. Re-run the block from its second statement after a migration adds tables or functions.

```sql reader-setup
CREATE ROLE claude_reader LOGIN PASSWORD '__READER_PASSWORD__' NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
ALTER ROLE claude_reader SET default_transaction_read_only = on;
ALTER ROLE claude_reader SET statement_timeout = '30s';
ALTER ROLE claude_reader SET idle_in_transaction_session_timeout = '60s';
DO $reader_setup$
DECLARE
  app_schemas text[] := string_to_array(replace('__APP_SCHEMAS__', ' ', ''), ',');
  pii_columns text[] := string_to_array(replace('__PII_COLUMNS__', ' ', ''), ',');
  app_roles text[] := string_to_array(replace('__APP_ROLES__', ' ', ''), ',');
  schema_name text;
  role_name text;
  tbl record;
  fn record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(app_schemas) AS s(name)
    WHERE s.name IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'vault', 'realtime', 'net', 'cron', 'graphql', 'extensions', 'pgsodium')
       OR left(s.name, 3) = 'pg_'
       OR left(s.name, 9) = 'supabase_'
  ) THEN
    RAISE EXCEPTION 'a system or platform schema is listed in the application schemas';
  END IF;
  FOREACH schema_name IN ARRAY app_schemas LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO claude_reader', schema_name);
  END LOOP;
  FOR tbl IN
    SELECT col.table_schema, col.table_name,
           string_agg(quote_ident(col.column_name), ', ' ORDER BY col.ordinal_position) AS column_list
    FROM information_schema.columns col
    JOIN pg_namespace n ON n.nspname = col.table_schema
    JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = col.table_name
    WHERE c.relkind IN ('r', 'p')
      AND col.table_schema = ANY (app_schemas)
      AND NOT (col.table_schema || '.' || col.table_name || '.' || col.column_name = ANY (pii_columns))
    GROUP BY col.table_schema, col.table_name
  LOOP
    EXECUTE format('GRANT SELECT (%s) ON TABLE %I.%I TO claude_reader', tbl.column_list, tbl.table_schema, tbl.table_name);
  END LOOP;
  FOR tbl IN
    SELECT c.oid, n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND n.nspname = ANY (app_schemas)
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'claude_reader_read')
  LOOP
    EXECUTE format('CREATE POLICY claude_reader_read ON %I.%I FOR SELECT TO claude_reader USING (true)', tbl.nspname, tbl.relname);
  END LOOP;
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname = ANY (app_schemas)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON ROUTINE %s FROM PUBLIC', fn.signature);
    FOREACH role_name IN ARRAY app_roles LOOP
      EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO %I', fn.signature, role_name);
    END LOOP;
  END LOOP;
END
$reader_setup$;
```

The gap check returns one row per problem and no rows when the role is safe. Run it as the owner after the setup and after every migration; the reader is not used while it returns a row.

```sql reader-gap-check
WITH params AS (
  SELECT 'claude_reader'::regrole::oid AS reader,
         string_to_array(replace('__APP_SCHEMAS__', ' ', ''), ',') AS app_schemas,
         string_to_array(replace('__PII_COLUMNS__', ' ', ''), ',') AS pii_columns
),
relations AS (
  SELECT c.oid, c.relkind, c.relacl, n.nspname, n.nspname || '.' || c.relname AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
pii AS (
  SELECT entry, split_part(entry, '.', 1) AS schema_name, split_part(entry, '.', 2) AS table_name, split_part(entry, '.', 3) AS column_name
  FROM params, unnest(params.pii_columns) AS entry
)
SELECT 'privilege ' || x.privilege_type || ' on ' || r.name AS gap
FROM relations r, params, aclexplode(r.relacl) x
WHERE x.grantee IN (params.reader, 0) AND x.privilege_type NOT IN ('SELECT', 'USAGE')
UNION ALL
SELECT 'privilege ' || x.privilege_type || ' on column ' || r.name || '.' || a.attname
FROM relations r
JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN params
CROSS JOIN LATERAL aclexplode(a.attacl) x
WHERE x.grantee IN (params.reader, 0) AND x.privilege_type <> 'SELECT'
UNION ALL
SELECT 'select on PII column ' || pii.entry
FROM pii
JOIN pg_namespace n ON n.nspname = pii.schema_name
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = pii.table_name
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = pii.column_name AND NOT a.attisdropped
CROSS JOIN params
WHERE has_column_privilege(params.reader, c.oid, a.attnum, 'SELECT')
UNION ALL
SELECT 'PII column not found ' || pii.entry
FROM pii
WHERE NOT EXISTS (
  SELECT 1 FROM pg_namespace n
  JOIN pg_class c ON c.relnamespace = n.oid
  JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped
  WHERE n.nspname = pii.schema_name AND c.relname = pii.table_name AND a.attname = pii.column_name
)
UNION ALL
SELECT 'select on view ' || r.name
FROM relations r, params
WHERE r.relkind IN ('v', 'm') AND has_any_column_privilege(params.reader, r.oid, 'SELECT')
UNION ALL
SELECT 'privilege outside the application schemas on ' || r.name
FROM relations r, params
WHERE NOT (r.nspname = ANY (params.app_schemas))
  AND (
    (r.relkind = 'S' AND has_sequence_privilege(params.reader, r.oid, 'USAGE,SELECT,UPDATE'))
    OR (r.relkind <> 'S' AND (
      has_table_privilege(params.reader, r.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(params.reader, r.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
    ))
  )
UNION ALL
SELECT 'usage on schema outside the application schemas ' || n.nspname
FROM pg_namespace n, params
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT (n.nspname = ANY (params.app_schemas))
  AND has_schema_privilege(params.reader, n.oid, 'USAGE')
UNION ALL
SELECT 'system or platform schema listed as an application schema ' || s.name
FROM params, unnest(params.app_schemas) AS s(name)
WHERE s.name IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'vault', 'realtime', 'net', 'cron', 'graphql', 'extensions', 'pgsodium')
   OR left(s.name, 3) = 'pg_'
   OR left(s.name, 9) = 'supabase_'
UNION ALL
SELECT 'member of ' || r.rolname
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
CROSS JOIN params
WHERE m.member = params.reader
UNION ALL
SELECT 'create on schema ' || n.nspname
FROM pg_namespace n, params
WHERE has_schema_privilege(params.reader, n.oid, 'CREATE')
UNION ALL
SELECT 'superuser or bypassrls'
FROM pg_roles r, params
WHERE r.oid = params.reader AND (r.rolsuper OR r.rolbypassrls)
UNION ALL
SELECT 'can execute security definer function ' || p.oid::regprocedure::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN params
WHERE p.prosecdef
  AND has_function_privilege(params.reader, p.oid, 'EXECUTE')
  AND has_schema_privilege(params.reader, n.oid, 'USAGE');
```

## Declaring PII

Treat these classes as PII by default: names, email addresses, phone numbers, postal addresses, dates of birth, government identifiers, IP addresses and device identifiers, precise location, payment data, authentication secrets and tokens, and free text a person wrote.

Propose the `__PII_COLUMNS__` list yourself from the schema in the repository's migrations: every column whose name, type or use puts it in one of those classes. The human confirms or corrects the list before running the setup. When a migration later adds a column in one of those classes, propose adding it, and the human re-runs the setup and the gap check.

## The local disposable-container carve-out

A local database is outside the reader rule when all three hold, and you confirm each in your hand-back: it runs on localhost, it holds synthetic data, and the container is disposable. Reach it through `docker exec` into the container, or with a command that names a loopback host explicitly, such as `psql -h 127.0.0.1`; the gate passes both. Starting, resetting and testing against it need no approval.

If you cannot confirm all three, treat the database as live.

## What still needs approval

Every other connection: an owner or service-role credential, a pasted connection string, a non-loopback host, a reader read spelled any other way than above, a database client with no reader convention, and every change to schema or data, which is applied one database per command. Each of these raises a permission prompt, and you explain it in plain English first, as `procedures/schema-migration.md` describes.

## Reporting an unknown

If a fact cannot be read through the reader service and the user does not approve another read, the fact stays unknown. Say it is unknown and state what you assumed in its absence. Do not infer a row count from a file, do not estimate a query plan, and do not describe a schema you have not read.
