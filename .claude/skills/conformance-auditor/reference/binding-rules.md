# Auditing a change against the project's binding rules

The rules are a body of authority you audit against. They are external to any single change,
they are owned by the user, and you audit conformance to them rather than authoring them.

## Where they live, and why this file does not copy them

The binding set is the invariant list in `.claude/CLAUDE.md` plus every file under
`.claude/rules/`. Those paths are symlinked live from the home configuration, so the file
on disk is the rule in force.

This file deliberately carries no copy of any rule's text. A copy is a second representation
of one fact, it agrees on the day it is written, and it drifts silently afterwards - the
failure mode a rule expressed twice invites. Auditing a change against a stale paraphrase is
worse than not auditing it, because the paraphrase looks authoritative.

So: open the rule file and read the rule. The table below tells you WHICH file to open for
a given diff, and what the violation looks like when it is visible in a diff at all.

## Closure

The inventory is the directory listing of `.claude/rules/`, taken at audit time - not the
table below. List the directory. If a rule file exists there that this table does not route,
that is an uncovered rule, and it is REPORTED as a gap in this procedure. It is not silently
skipped, and it is not covered by inventing a row for it mid-audit.

A pinned count of rules, or a curated subset treated as the whole, is a change-detector
wearing a census costume. The listing is the census.

## Routing, by what the diff touches

| The diff contains | Open | Violation signature in a diff |
|---|---|---|
| any authored source file | `common/no-comments.md` | an added explanatory comment, docstring, or section-header comment; the carve-out is shebangs and tool-required pragmas only |
| any authored file at all | `.claude/CLAUDE.md` | an emoji anywhere; AI co-author attribution in a commit, PR or comment |
| new or changed functions, modules, data flow | `common/coding-style.md` | in-place mutation of an argument or shared object; a file past the size ceiling; a swallowed error; unvalidated input at a boundary |
| added, changed or deleted tests | `common/testing.md` | a test that duplicates existing coverage; assertions on implementation detail rather than a public surface; a change-detector; a sleep, a real network call, shared mutable state |
| a gate, census, lint or check | `common/testing.md` | a pinned count or a sampled allowlist where a closed census is required |
| commits on the branch | `common/git/commits.md` | a refactor mixed with a behavior change in one commit; a message outside Conventional Commits |
| the branch itself | `common/git/branching.md` | a commit made directly on the default branch |
| a pull request | `common/git/pull-requests.md` | a PR opened by any path other than the centralized tool; a title outside the grammar; a Verified line for a check that was not run |
| credentials, auth, input handling, external calls | `common/security.md` | a hardcoded secret, token or key; an error message leaking sensitive data |
| SQL, migrations, cloud or database config | `common/no-direct-db-access.md` | any code path or command that connects to a live project database or cloud admin surface |
| a subagent dispatch, or an agent definition | `common/delegation-discipline.md` | the main thread re-running a subagent's checks; a new narrow agent that fails the anti-sprawl test |
| a skill, rule, or agent naming another by string | `.claude/CLAUDE.md` | a bare skill name where the fully qualified form is required; a name that resolves to no definition |
| a doc, report, or recommendation citing an external claim | `common/research-citations.md` | a claim with no verifiable URL and no unverified marker; a fabricated path or line number |
| anything where two goals conflict | `common/pillars.md` | a trade that bought speed with correctness, or correctness traded for token cost |
| a subagent dispatch, the ordering of dispatches, or an agent's output contract | `common/agents.md` | two dispatches over disjoint files sent one after another; an output field answerable by attestation rather than by doing the work; an agent dispatched only to keep a turn alive |
| a ledger thread, a decision record, or a session-continuity claim | `common/continuity-ledger.md` | a ledger tool named that the server does not register; a claim about thread state the live tool surface does not support |
| the ordering of the work itself, from plan through review to release | `common/git-workflow.md` | a step taken out of order; verification widened to the full suite where a narrower rung was available |
| a hook, a permission entry, or a change to permission mode | `common/hooks.md` | bypass-permissions reached by any of its doors without the required layers asserted; a hook that applies a change rather than linting or auditing it |
| a memory file, or the memory index | `common/memory-discipline.md` | a memory derivable from the repository, its git history, or CLAUDE.md; a relative date where an absolute one belongs; a duplicate written instead of an update to the existing file |
| a data-access layer, a repository interface, or an API response shape | `common/patterns.md` | data access that bypasses the repository interface; an API response outside the project's declared envelope |
| a model pin, a long-running command, or a context-budget decision | `common/performance.md` | a command expected to exceed roughly sixty seconds run in the foreground; an orchestration role pinned to a reasoning tier this rule assigns elsewhere |
| any prose returned to a human - a report, a hand-back, a document | `common/writing-style.md` | a fact carrying no stated relevance; narration of the answer's own structure; a compound noun used before it is glossed |
| a question about a library, framework, SDK, API, or CLI tool | `context7.md` | an external API written from recall where this rule requires current documentation be fetched first; the rule invoked for refactoring or business-logic debugging, which it excludes by name |
| a TypeScript or JavaScript source file | the five files under `typescript/` | audit the diff by OPENING them, but never conclude a dispatched agent ignored one: all five carry `paths:` frontmatter and do NOT reach a subagent's context, established 2026-09-10 by two zero-tool-call probes that received every `common/` file and none of these |

## Whatever standard the project declares alongside these rules

Where the project has also declared its own external verification standard - a versioned
spec, a configured set of automated checks - that standard is a second body of authority,
audited the same way: open its own spec file and read it, rather than auditing from recall
or from a paraphrase kept in this skill.

If your audit produces a rule or a check that neither the binding rules nor the project's
declared standard actually has, you have not found a violation. You have found a proposal.
Take it to `reference/proposals.md`.
