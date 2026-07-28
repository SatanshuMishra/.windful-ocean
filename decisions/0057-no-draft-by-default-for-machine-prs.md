---
Status: accepted
Date: 2026-07-28T03:18:36.944Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0057. Machine-opened PRs are not drafts

## Context

GitHub's own coding agent opens PRs as drafts as a safety signal, and this was evaluated for mitosis-opened PRs as part of the centralized format.

## Options

- Open machine-authored PRs as drafts by default
- Treat machine-opened and human-opened PRs identically

## Outcome

Identical treatment; no draft default. Claude can never merge a PR under any origin — merge is blocked both in the PreToolUse hook and in permissions.deny, across gh pr merge, the REST merge endpoint, both GraphQL mutations, and the MCP merge tool. Draft status would therefore add a click on top of an already-closed control rather than adding a control. The anti-over-trust work is carried by the mandatory Verified vs Not-verified split in the body instead.
