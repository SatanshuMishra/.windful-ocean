# No Direct Live-Database Access

Never connect to a live, hosted, staging or production database or cloud-admin surface. Not to read, not to inspect, not to apply. A read-only credential does not make it acceptable: the rule is never connect, not never write.

Author SQL as a file. A human runs it and pastes back any result. That paste cycle is the audit trail, not a degraded fallback.

A local, disposable container holding synthetic data is not a live database and is not covered by this rule.

Procedure for authoring migrations, rollbacks, and live-fact queries is the `platform-engineer` skill.
