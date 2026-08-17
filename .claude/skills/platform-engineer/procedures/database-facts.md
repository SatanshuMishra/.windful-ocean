# Getting facts that only a live database holds

Sometimes the reasoning genuinely needs live data: a row count that decides whether a backfill can run in one statement, a query plan that decides whether an index is worth adding, or the current state of a schema that the committed artifacts do not pin.

You still do not connect. You author the query and a human runs it.

## The paste cycle

1. Write the exact SQL you need - the `EXPLAIN`, the `SELECT`, the catalog query - into a fenced block in your response, or into a file when it is long enough to be worth keeping.
2. State plainly what you will do with each possible answer, so the human knows the round trip is worth making and can spot a question that does not need asking.
3. The human runs it in the dashboard and pastes the result back.
4. You reason over the pasted result.

That adds one round trip. The round trip is the point: it keeps the dashboard the single record of what ran, and it keeps every read of production behind a deliberate human action.

Ask for the smallest thing that answers the question. Never ask for a dump of user data, and never ask for a query whose result you do not need in order to decide something specific. If a question can be answered from committed artifacts instead, answer it from those and skip the cycle.

## The one carve-out, and its exact edges

A local, disposable container used only for tests is exempt. That means the project's own local development stack, running on localhost in a throwaway container, seeded with synthetic data, and destroyed after the run. Starting it, resetting it, and running the project's database tests against it are permitted.

The carve-out reaches nothing else. Every hosted, staging, or production project stays human-applied and is never agent-connected. Any command that targets a remote project - push, pull, a migration applied upstream, a function deployed - remains prohibited regardless of which container is running locally. A remote connection string is not made acceptable by the presence of a local one.

Before using the carve-out, confirm three things and say so in your hand-back: the target is localhost, the data is synthetic, and the container is disposable. If you cannot confirm all three, use the paste cycle instead.

## Reporting an unknown

If the human does not run the query, the fact stays unknown. Say the fact is unknown and state what you assumed in its absence. Do not infer a row count from a file, do not estimate a query plan, and do not describe a schema you have not read. An assumption labelled as an assumption is usable; one presented as a measurement is not.
