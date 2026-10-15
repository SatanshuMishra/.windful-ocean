# SQL authoring standards

Apply these to every query, migration and backfill you write. Where the project's committed SQL already follows a different convention, match the project and say so in the hand-back.

## Naming and types

- Name tables, columns, constraints and indexes in snake_case.
- Name tables in the singular, unless the project's existing tables follow another convention; then follow theirs.
- Give a new table a `bigint GENERATED ALWAYS AS IDENTITY` primary key.
- Store points in time as `timestamptz`, never `timestamp` without a zone.
- Store money as `numeric` with an explicit precision and scale, never as a float.
- Store strings as `text` with a CHECK on length or shape, rather than `varchar(n)`.

## Constraints and keys

- Make every column NOT NULL unless an absent value means something the code handles.
- Name every constraint, so a later migration can drop or validate it by name.
- Index every foreign key column, so a delete or update on the parent does not scan the child.
- Enforce each invariant the database can express with a CHECK, rather than in application code alone.

## Indexes

- Add an index for a query the code actually issues, found by reading its call sites, never on speculation.
- Build an index on a live table with `CREATE INDEX CONCURRENTLY`, in its own migration and outside a transaction.
- Prove an index is used with `EXPLAIN` through the reader service before and after, and drop one the plans never use.

## Queries

- Name the columns you select; never write `SELECT *` in application code.
- Pass values as bound parameters; never build SQL by string concatenation.
- Bound every result set with a `LIMIT` or a predicate the code guarantees is small.
- Page with keyset pagination on an indexed, unique ordering, never with a growing `OFFSET`.

## Security and privileges

- Grant each role the least privilege its work needs, by schema, table and column.
- Enable row level security on every table an API role can reach, and write a policy for each operation it performs.
- Write a `SECURITY DEFINER` function only with `SET search_path` pinned on it, and revoke its execute from PUBLIC before granting it to the roles that call it.
- Keep secrets, passwords and connection strings out of every SQL file.

## Safe migrations

- Put one logical change in each migration file.
- Put schema changes and data changes in separate migrations.
- Never edit a migration that has been applied; write a new one.
- Rename a column or change its type by expand, migrate, then contract: add the new shape, backfill and dual-write, switch reads, then drop the old shape in a later release.
- Open each migration with `SET lock_timeout` and `SET statement_timeout`, so a blocked lock fails fast instead of queueing traffic behind it.
- Add a NOT NULL check or a foreign key as `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate statement, so the validating scan does not hold an exclusive lock.
- Avoid statements that rewrite a whole table, such as a type change that is not binary-compatible or a volatile default on a new column.
- Backfill in bounded batches keyed on an indexed column, committing each batch, and state the expected time per batch.
- Pair every forward migration with a rollback written at the same time.
- Prove a backup or a scoped restore exists before anything destructive, and name it in the hand-back.
- Scope every data load to the tables the change owns; never truncate or reload a table the change does not own.

## Proof on the destination

- Measure before and after counts through the reader service, for every table the change touches.
- Reconcile every changed column by value over its full population, not by a sample or a count alone.
- Treat a wrong value in one row as a class: write the predicate that finds the class, run it over the whole table, and close only when it returns no rows.
