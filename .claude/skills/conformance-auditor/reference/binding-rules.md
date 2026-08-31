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
| a subagent dispatch, or an agent definition | `common/delegation-discipline.md`, `common/agent-roster.md` | the main thread re-running a subagent's checks; a new narrow agent that fails the anti-sprawl test |
| a skill, rule, or agent naming another by string | `.claude/CLAUDE.md` | a bare skill name where the fully qualified form is required; a name that resolves to no definition |
| a doc, report, or recommendation citing an external claim | `common/research-citations.md` | a claim with no verifiable URL and no unverified marker; a fabricated path or line number |
| anything where two goals conflict | `common/pillars.md` | a trade that bought speed with correctness, or correctness traded for token cost |

## Whatever standard the project declares alongside these rules

Where the project has also declared its own external verification standard - a versioned
spec, a configured set of automated checks - that standard is a second body of authority,
audited the same way: open its own spec file and read it, rather than auditing from recall
or from a paraphrase kept in this skill.

If your audit produces a rule or a check that neither the binding rules nor the project's
declared standard actually has, you have not found a violation. You have found a proposal.
Take it to `reference/proposals.md`.
