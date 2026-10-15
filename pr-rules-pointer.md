# pr-rules-pointer: Repair stale pointers to the deleted pull-requests rules file
Status: active
Updated: 2026-10-15T22:12:00.175Z
Next ids: c4 D1 R1 S1

## Goal

Every reference to .claude/rules/common/git/pull-requests.md, which commit a700c9d1 deleted, either points at a file that exists and states the pull-request field set, caps and title grammar, or is removed, so the pr skill, the bash gate's deny message and the conformance auditor stop sending readers to a missing file.

## Done when

- [ ] c1 No file under .claude references .claude/rules/common/git/pull-requests.md unless that file exists.
- [ ] c2 The pr skill names a location for the field set, caps and title grammar, and that location exists.
- [ ] c3 The bash gate and pull-request tooling tests still pass after the change.

## Where things stand

Converted from the old ledger.

## Next step

Decide whether to restore pull-requests.md from the parent of commit a700c9d1 as an on-demand reference file, or to repoint every reference at .claude/lib/git/pr-format.mjs and the pr skill itself, starting from the pointer on line 21 of .claude/skills/pr/SKILL.md and the deny message on line 131 of .claude/hooks/block-destructive-bash.sh.

## Decisions in force

## Open risks

## Settled, do not reopen

## Where the details live

- pr skill with the stale pointer: .claude/skills/pr/SKILL.md
- bash gate deny message naming the rules file: .claude/hooks/block-destructive-bash.sh
- conformance auditor binding-rules table: .claude/skills/conformance-auditor/reference/binding-rules.md
- pull-request title and field validation: .claude/lib/git/pr-format.mjs
- commit that deleted the rules file: git show a700c9d1
- Old ledger record: thread 01M3SZ60QMKBR5PB2YNGDRBQT2 in refs/logbook/archive/ledger
