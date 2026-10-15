# Live Databases: Read Freely, Change Only With Approval

Databases are fragile. Unintended data loss is the failure that matters most, so every change to a live, hosted, staging or production database waits for the user.

## Reads run without asking

Run reads, audits and exports without asking, through the project's reader service: a pg service named `<project>-reader` that logs in as `claude_reader`. The database itself keeps that role read-only and free of PII. Setting it up is in the `platform-engineer` skill's `procedures/database-facts.md`.

Never select, export or paste PII, even through an approved connection, unless the user asks for that data by name. Never commit an export.

## Changes wait for approval

Before any statement that changes schema or data, explain each one in plain English:

- what it changes;
- the objects and rows it touches, with counts read first;
- the data it destroys or rewrites, or that no data is lost;
- its lock and downtime impact;
- how to undo it;
- the read that will verify it.

Then make the call. The permission prompt is the approval. Nothing runs a change without the user's approval, and a gate asks the user to approve every such command.

When the user declines, or no one can approve, hand over the statements or migration files in run order, each with its pre-check, backup, verification read and rollback.

Write SQL to the `platform-engineer` skill's `procedures/sql-standards.md`.

## Credentials stay out of the transcript

Never read or write `~/.pgpass` or `~/.pg_service.conf`. Never print a connection string or a password.

## Local containers

A local disposable container holding synthetic data, reached through `docker exec` or an explicit loopback host, is not a live database; this rule does not cover it.
