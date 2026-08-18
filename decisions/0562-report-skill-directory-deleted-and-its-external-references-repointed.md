---
Status: accepted
Date: 2026-08-18T05:27:28.584Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0562. Delete the report skill directory in U6.2 and repoint the three references the census cannot see

## Context

Decision 0481 withdrew the report skill from the architecture on a user ruling that it must not be used in its current state, but left the directory on disk. Four of U6.2's seventeen sites are report-writer references inside .claude/skills/report/ (SKILL.md:3, :8, :16, :24), so the retirement census cannot reach zero while the directory stands unrepointed. The u62-acceptance document section 8 explicitly left the disposition open: deleting the directory discharges all four, retaining it obliges repointing all four, and the census proves either path because it does not care which is chosen. What the census cannot see is the other direction of coupling: three references to the SKILL itself sit outside its token set, at rules/common/research.md:33 and :35 and skills/agent-gap-audit/SKILL.md:26, and a fourth in the global CLAUDE.md bullet. The census scans only the nine retiring agent names, so deleting the directory would go green while leaving those routing instructions naming a skill that no longer exists.

## Options

- Delete the directory and repoint its three external skill references inside U6.2
- Retain the directory and repoint its four report-writer references to technical-writer
- Delete the directory and file the three external references as a separate item above the ceiling

## Outcome

User ruling: delete .claude/skills/report/ and repoint the three external references to the skill in the same unit. This executes 0481 fully rather than leaving a withdrawn skill live on disk, and it puts the three census-blind sites into U6.2's declared acceptance criterion explicitly, so they are gated rather than trusted. Retaining and repointing to technical-writer was rejected because it would leave /report working in exactly the state 0481 ruled must not be used, buying census-green at the cost of contradicting the ruling that created the unit. Filing the danglers above the ceiling was rejected because a green census standing over three live references to a deleted skill is the same class of defect the retirement census exists to remove - a check reporting an absence it never measured.
