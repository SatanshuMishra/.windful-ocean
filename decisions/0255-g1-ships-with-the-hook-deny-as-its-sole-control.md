---
Status: accepted
Date: 2026-08-05T23:56:58.649Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0255. G1 ships with the hook deny as its sole control; branch protection is deliberately not deployed

## Context

Threat model section 4 named GitHub branch protection as G1's PRIMARY control, "server-side, outside the agent's reach", with the hook deny as a secondary defense-in-depth layer. Reconnaissance falsified the parenthetical: gh auth status shows the token carries repo scope, which is admin on a repo the user owns, so the agent can delete the protection rule as easily as it can merge. The primary control sat inside the blast radius of the threat it was meant to contain. Repo is public (SatanshuMishra/.windful-ocean), so classic branch protection IS available on the free plan; the solo-repo constraint would have required zero required approvals.

## Options

- Enable branch protection and add a hook deny for protection/ruleset tampering, restoring honest two-layer defense
- Have the agent apply the protection itself, which proves in the act that the control is agent-reachable
- Skip branch protection; the hook deny becomes G1's sole control and section 4 is amended to say so

## Outcome

Skipped, by the repo owner. The hook deny is G1's sole control and threat model section 4's G1 Control cell is amended to drop the primary/secondary framing and the "outside the agent's reach" claim. Explicitly NOT adding a protection/ruleset-tampering deny in c4: with no protection rule deployed it closes nothing, and .claude/hooks/CLAUDE.md forbids hardening beyond what G1-G5 requires. CONDITION for any future revisit - if branch protection is ever enabled, the tampering deny must land in the same change, or the layering is circular again for exactly the reason found here.
