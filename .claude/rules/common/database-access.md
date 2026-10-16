# Live Databases: Read Freely, Change Only With Approval

Databases are fragile. Unintended data loss is the failure that matters most, so every change to a live, hosted, staging or production database waits for the user.

## Reads run without asking

Run reads, audits and exports without asking, through the project's reader service: a pg service named `<project>-reader` that logs in as `claude_reader`. The database itself keeps that role read-only and free of PII. Setting it up is in the `platform-engineer` skill's `procedures/database-facts.md`.

Keep PII out of every query, export and paste, even through an approved connection, until the user asks for that data by name. Keep every export out of commits.

## Changes wait for approval

Before any statement that changes schema or data, explain each one in plain English:

- what it changes;
- the objects and rows it touches, with counts read first;
- the data it destroys or rewrites, or that no data is lost;
- its lock and downtime impact;
- how to undo it;
- the read that will verify it.

Then make the call. The permission prompt is the approval: a change runs only once the user approves it, and a gate asks the user to approve every such command.

When the user declines, or no one can approve, hand over the statements or migration files in run order, each with its pre-check, backup, verification read and rollback.

Write SQL to the `platform-engineer` skill's `procedures/sql-standards.md`.

## Credentials stay out of the transcript

Connect by pg service name and let the client read the credentials itself; settings deny rules and the `db-gate.mjs` hook refuse every read and write of `~/.pgpass` and `~/.pg_service.conf`. Refer to a connection by its service name, with its connection string and password left unprinted.

## Local containers

This rule covers live databases. A local disposable container holding synthetic data, reached through `docker exec` or an explicit loopback host, falls outside it.
