---
Status: accepted
Date: 2026-08-24T18:39:33.795Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0716. The twelve remaining briefs shared one defect: a captured exit code with no stated disposition

## Context

Twelve briefs sat in review because the lint could prove structure but not whether a check can fail for its claim. Reading each criterion against the command meant to falsify it found one defect in all twelve and six narrower ones. The dominant shape is a verification block that captures an exit code into a named variable and never says what the variable must be, so the block reports numbers a reader interprets rather than a result that fails.

## Options

- Repair each brief by hand and describe the findings in prose
- Encode every finding as a lint rule, then repair until the lint is green
- Leave the twelve and escalate the audit as a separate unit

## Outcome

Every finding became a rule, so the class is caught mechanically from now on: unstated exit dispositions, expectations written in trailing comments, elided placeholders that cannot run, and greps for a path string where the code uses a relative specifier. The last was demonstrated live: the pull request tool reaches the engine through a relative parent path and contains zero occurrences of the string its brief required a count of zero for, so that acceptance criterion was already satisfied on the parent commit by changing no file. Six narrower holes were repaired: a capture claimed to produce fixtures with nothing counting them, two closed enumerations with no census behind them, two scenario selectors that would exit clean on a name matching no row, a distinguishability claim with no comparison, and a criterion naming an assertion its own verification never performed. One conflict is recorded rather than repaired, because it is a decision: the plugin unit's criterion mandates a flag that refuses the subscription credential, and the subscription is what every unit on this migration was decided to run on. The lint reports zero failures over twenty-four briefs with four exemptions, each carrying a written reason, and one of those reasons was made true by adding the resolve pass it claimed rather than by leaving it standing.
