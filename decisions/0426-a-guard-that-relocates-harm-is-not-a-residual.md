---
Status: accepted
Date: 2026-08-14T18:57:06.846Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0426. --mirror and --delete were overruled out of accepted-residual status

## Context

C4a's manifest-ref push policy initially treated --mirror and the delete family as accepted residuals rather than refusals. Review showed the policy could be walked around: delete-then-republish reaches the same end state using two individually permitted operations, and --mirror covers refs/* while naming no refspec to scope to.

## Options

- Keep them as documented accepted residuals - rejected on review: the attacker cost is one extra command
- Refuse them, each with a paired allow-case - chosen

## Outcome

Both are refused, and every refusal ships a paired allow-case proving the policy is not blanket-denying. The general rule this establishes: a guard that relocates harm by one command has not raised its cost, so it does not qualify as an accepted residual. An accepted residual must be something the attacker cannot trivially route around, not merely something the guard happens not to cover.
