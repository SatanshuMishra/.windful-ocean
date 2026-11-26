# Schema design and migration authoring

You produce files, and a change to schema or data reaches a live database only through the approval flow, which takes one approval per database however many statements the change holds:

1. Explain the change in plain English before the first database: what it changes; the objects and the rows it affects, with counts measured by a read through the reader service; the data it destroys or rewrites, or the words no data is lost; its lock and downtime impact; how to undo it; and the verification read you will run afterwards. Before each later database, give its own counts and anything else that differs.
2. Apply the whole change to one database in one command, which raises that database's one permission prompt, as `~/.claude/rules/common/database-access.md` sets out. Then run the verification read and report it per `procedures/handback.md` before the next database, and stop at the first database that fails, leaving the rest unchanged.
   - Run every file of the change in that command, in run order, stopping at the first error: `psql "service=<service>" -v ON_ERROR_STOP=1 -f <first file> -f <second file>`, or the project's migration tool applying everything pending to that one database.
   - Add `--single-transaction` when every statement can run inside a transaction, so a failure leaves the database unchanged. Leave it off when one cannot, such as `CREATE INDEX CONCURRENTLY`, or when a backfill commits in batches, and say in the explanation what a failure can leave half-applied.
   - Name one database per command. Two databases chained or looped in one command raise a single prompt for both, and the gate does not tell them apart.
3. When approval is withheld, run nothing: hand over every migration file in run order and each database's command that applies them, per `procedures/handback.md`.

Reads go through the reader service in `procedures/database-facts.md`, and credentials never enter the transcript.

## 1. Read the current state from artifacts, not from a server

The committed artifacts are the source of truth available to you: existing migration files, generated types, schema dumps, seed files, and any ORM schema definition the project keeps in the repository. Read them before proposing anything. If those artifacts and a claim in prose disagree, the artifacts win.

Match the project's existing migration convention exactly rather than importing one. Read the newest few files in the migrations directory and copy their naming, their ordering scheme, and their header shape. A common convention is `supabase/migrations/YYYYMMDD_<descriptive>.sql`, but confirm it against the directory rather than assuming it.

## 2. Design before writing DDL

Schema is the hardest thing in a system to reverse, so the design decision gets the reasoning and the SQL gets the care.

- Name the invariant each constraint enforces, and prefer a database constraint over application-level enforcement when the database can express it.
- Decide nullability deliberately. A nullable column added now is a migration later.
- Index for the queries the project actually issues, which you find by reading the query call sites, not by guessing.
- For any column holding money, time, or an identifier, pin the exact type and precision rather than accepting a default.

## 3. Author the forward migration

- Follow `procedures/sql-standards.md` for naming, types, constraints, indexes, locking, backfills and proof on the destination.
- One migration per logical change. A rename and a behavioural change do not share a file.
- Write explicit, parameterized, deterministic DDL and DML. No string-concatenated identifiers, no values interpolated from anywhere.
- Make it idempotent where the dialect allows it, so a partially-applied run can be re-run safely.
- Order the statements so the file is safe to stop halfway: create before reference, backfill before constraining, constrain before dropping.
- For a large backfill, write it in bounded batches and say in the hand-back how long a batch is expected to take. A migration that locks a hot table for an unbounded period is a production incident authored in advance.

## 4. Author the rollback in the same change

Every forward migration ships a paired rollback when the project keeps them, and always when the forward migration is destructive. Write it at the same time, never afterwards.

A destructive change - dropping a column, dropping a table, narrowing a type, removing a constraint that data now depends on - is not reversible by SQL alone once it runs, because the data is gone. Say so explicitly in the hand-back, and give the human the exact backup or export step that must precede the forward migration.

## 5. What you never do here

- Run a statement that changes schema or data on a live database before explaining it in plain English and before the user approves it at the permission prompt, or reach a database by any path `procedures/database-facts.md` does not describe.
- Run a migration tool's apply, push, pull, or reset verb against a live project without the user's approval at the permission prompt.
- Put a credential or connection string in a migration file.
- Author a destructive statement without both a rollback and a stated callout.

## 6. Return

Hand back per `procedures/handback.md`: the migration paths, what each one changes, the rollback path, any destructive statement called out by name, and the exact step the human takes to apply it.
