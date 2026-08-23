---
Status: accepted
Date: 2026-08-23T02:58:11.022Z
Thread-Id: 01M0JRG6E36RHFD08HD0K8PN84
---

# 0672. M7 ships as an evidence document and changes no repository file

## Context

M7's declared file scope is receipts.config.json plus a new harness note. Five mutation experiments ran at trunk, each in an isolated clone against a measured fifteen-failure noise floor, each confirming a clean revert. Four branches are covered and one, park-on-dispatch-outcome, is covered for only two of thirteen outcome values. receipts.config.json already carries G14 at block mode with max_mutants twelve, and the file has no field for registering individual branch targets, so nothing in it needs to change.

## Options

- Ship M7 as the evidence document alone, with no repository change and no pull request
- Invent a receipts.config.json edit so the unit produces a reviewable pull request
- Close the branch-3 coverage gap inside M7 by writing tests for the ten unprotected outcome values

## Outcome

Ship the evidence document alone. A unit that correctly requires no code change is a valid outcome, and manufacturing a config edit to justify a pull request would be a change with no reason to exist. The branch-3 gap is filed as a new item rather than closed here, because the SPEC states gaps are filed and not fixed inside this unit and acceptance is a ceiling. Noted honestly: the acceptance clause requiring the local G14 replica to pass before push is vacuous when there is nothing to push. Three bookkeeping corrections are recorded in the document, including an unassigned sixth guard site at parking.mjs selectPreservedBuilt.
