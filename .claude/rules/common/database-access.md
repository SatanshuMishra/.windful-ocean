# Live Databases: Read Freely, Change Only With Approval

Data loss is the failure that matters most, so every change to a live, hosted, staging or production database waits for the user.

## Reads run without asking

Run reads, audits and exports without asking, through the database's reader service: a pg service named `<database>-reader` that logs in as `claude_reader`. The database itself keeps that role read-only and free of PII. An SQL tool such as MCP `execute_sql` prompts on every call; never read through one while a reader exists. Setting one up is in the `platform-engineer` skill's `procedures/database-facts.md`.

Keep PII out of every query, export and paste, even through an approved connection, until the user asks for that data by name. Keep every export out of commits.

## Changes wait for approval, once per database

The user's words set the scope and are the go-ahead: "apply the migration to X" covers X alone; "to all production databases" covers every database serving this project except development, never another product's. List the databases you resolved, naming any left out as unsure, then ask nothing more in chat.

Each database gets one change, every pending migration in scope in run order, and one prompt, however many statements it holds.

Before the first database, explain the change in plain English:

- what it changes;
- the objects and rows it touches, with counts read first;
- the data it destroys or rewrites, or that no data is lost;
- its lock and downtime impact;
- how to undo it;
- the read that will verify it.

Before each later database, give its counts and what differs.

Apply the whole change to one database in one command, stopping at the first error, in one transaction when every statement allows it. The prompt is the approval and the gate asks once per command, so never name two databases in one. Verify before the next database; when one fails, stop. The commands, and reads for a database without a reader, are in the `platform-engineer` skill's `procedures/schema-migration.md`.

When the user declines, or no one can approve, hand over the migration files in run order and each database's command, with its pre-check, backup, verification read and rollback.

Write SQL to the `platform-engineer` skill's `sql-standards.md`.

## Credentials stay out of the transcript

Connect by pg service name and let the client read the credentials; settings deny rules and the `db-gate.mjs` hook refuse every read and write of `~/.pgpass` and `~/.pg_service.conf`. Never print a connection string or password.

## Local containers

A local disposable container holding synthetic data, reached through `docker exec` or an explicit loopback host, falls outside this rule. A migration command run on the host still asks, unless it sets an inline loopback `DATABASE_URL` for the one tool `docs/security/db-gate-threat-model.md` exempts.
