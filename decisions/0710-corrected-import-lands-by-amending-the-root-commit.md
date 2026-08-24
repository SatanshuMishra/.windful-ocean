---
Status: accepted
Date: 2026-08-24T07:53:48.406Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0710. The corrected import tree lands by amending the root commit, authorized by the user

## Context

The import unit's root commit was already pushed to the new repository's default branch when its acceptance check was found to fail. The unit declares a single root commit and every later unit cuts its branch from that commit, while the enforcer diffs the base tip rather than the merge base. Correcting the tree therefore had to either rewrite that commit or stack a second one. The agent was first instructed to amend and force-push on the orchestrator's own judgment; the permission classifier refused it, correctly, because a force-push to a default branch is outward-facing and destructive.

## Options

- Amend the root commit and force-push, preserving the single-root shape
- Land the missing modules as a follow-up commit, rewriting no history
- Delete the repository and re-run the unit end to end against the corrected closure

## Outcome

Amend and force-push, chosen by the user when asked explicitly. The blast radius is one commit made minutes earlier in a private repository with no pull request, no second branch and no puller, and the single-root shape is what later units and the enforcer's base-tip diff both assume. The wider rule this settles: a destructive outward-facing action is put to the user rather than authorized by the orchestrator, even when the orchestrator judges it safe and even when it is the technically cleanest option.
