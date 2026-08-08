---
Status: accepted
Date: 2026-08-08T04:48:25.347Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0290. The cutover verb moves real content aside instead of deleting it, which defers the graphify-report ruling rather than forcing it

## Context

The standing risk list required disposing of three live leftovers before hooks/ and rules/ could collapse into release symlinks: ~/.claude/hooks/graphify-out (dated 2026-06-30), ~/.claude/rules/graphify-out (2026-06-28), and ~/.claude/rules/context7.md. It also carried an unresolved ask - collapsing rules/ stops ~/.claude/rules/graphify-out/GRAPH_REPORT.md being auto-loaded as a global instruction file in every session, and the user had not ruled on that. Measured this session: context7.md is byte-identical to the tracked .claude/rules/context7.md on main, so the release supplies it and the live copy is pure duplicate. Both graphify-out directories are stale leftovers of per-directory graphify runs from before the relocate-graphify-output unit moved output to the depth-1 ~/.claude/graphify-out, which now holds current output dated 2026-08-03. The rules/ report being loaded as a global instruction is therefore an accident of the old output path, not a designed property - and the depth-1 replacement is 1.3MB, which is not loadable as an instruction file at all. Both graphify-out paths are gitignored by **/graphify-out/, so neither can ever enter a release.

## Options

- Design the cutover verb so it NEVER deletes real content: a real file or directory in the way is renamed to <entry>.pre-cutover-<sha8> and the entry link is created in its place, with the rename recorded in a journal that a --rollback verb consumes - ADOPTED
- Give the verb a disposal allowlist naming the three leftovers, and delete them during the cutover. Rejected: it hard-codes today's live tree into a verb that must be safe on re-run, and it makes an irreversible deletion part of an already high-stakes swap
- Block the cutover on an explicit user ruling about the graphify report before building anything. Rejected: the ruling is only needed if the content is destroyed, and it is cheaper to preserve the content and let the user rule afterwards
- Delete the two graphify-out directories by hand before running the cutover. Rejected: it leaves the verb unsafe for any other machine or any future re-run, where a different real leftover would be in the way

## Outcome

Adopted. The cutover verb treats real content in the way as something to preserve, not something to dispose of: rename aside, link, journal the rename, and offer rollback. No disposal allowlist exists, and the verb needs no knowledge of which leftovers happen to be present.

This dissolves the graphify ruling rather than answering it. After cutover the stale report is still on disk under hooks.pre-cutover-<sha8>/ and rules.pre-cutover-<sha8>/, it is simply no longer loaded into session context - which is the outcome the relocate-graphify-output unit already chose deliberately for new output. The user can delete or restore it later with full information and no time pressure. The same rename preserves the duplicate context7.md at no cost, so the byte-identity measurement is a convenience rather than a dependency.

The general rule this establishes for one-time migrations against live state: a migration verb should be judged by what it makes recoverable, not by how clean it leaves the tree. Deleting is the operator's separate, unhurried act; the verb's job is to make the swap reversible. A verb that deletes cannot be re-run safely and cannot be rolled back, and both properties matter more here than tidiness, because the thing being migrated is the config serving the session performing the migration.
