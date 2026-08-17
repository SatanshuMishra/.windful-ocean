# Schema design and migration authoring

You produce files. A human runs them. Nothing in this procedure connects to a database.

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

- One migration per logical change. A rename and a behavioural change do not share a file.
- Write explicit, parameterized, deterministic DDL and DML. No string-concatenated identifiers, no values interpolated from anywhere.
- Make it idempotent where the dialect allows it, so a partially-applied run can be re-run safely.
- Order the statements so the file is safe to stop halfway: create before reference, backfill before constraining, constrain before dropping.
- For a large backfill, write it in bounded batches and say in the hand-back how long a batch is expected to take. A migration that locks a hot table for an unbounded period is a production incident authored in advance.

## 4. Author the rollback in the same change

Every forward migration ships a paired rollback when the project keeps them, and always when the forward migration is destructive. Write it at the same time, never afterwards.

A destructive change - dropping a column, dropping a table, narrowing a type, removing a constraint that data now depends on - is not reversible by SQL alone once it runs, because the data is gone. Say so explicitly in the hand-back, and give the human the exact backup or export step that must precede the forward migration.

## 5. What you never do here

- Connect to, query, or apply against any database, local remote or otherwise, outside the narrow carve-out in `procedures/database-facts.md`.
- Run a migration tool's apply, push, pull, or reset verb against a project.
- Put a credential or connection string in a migration file.
- Author a destructive statement without both a rollback and a stated callout.

## 6. Return

Hand back per `procedures/handback.md`: the migration paths, what each one changes, the rollback path, any destructive statement called out by name, and the exact step the human takes to apply it.
