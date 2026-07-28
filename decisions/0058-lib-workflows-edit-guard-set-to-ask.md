---
Status: accepted
Date: 2026-07-28T03:18:42.480Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0058. Edit guard on .claude/lib and .claude/workflows converted from deny to ask

## Context

Hard Edit deny rules on .claude/lib/** and .claude/workflows/** blocked the exact files the centralization had to modify (mitosis-git.mjs and mitosis.js). A deny rule refuses silently and cannot be satisfied by a prompt, so it had to be changed before any implementation could start.

## Options

- Temporarily remove the two denies and restore them after the work lands
- Convert both to ask so every edit to those trees prompts the human
- Keep the denies and have the human apply the engine edits by hand

## Outcome

Converted to an ask array (user chose). Preserves the guardrail's intent — nothing modifies the engine without a human seeing it — while unblocking the work, and has no restore step to forget. THIS IS STILL PROVISIONAL: the disposition is an open completion criterion. Next session must decide whether to restore the hard denies now that the work has landed, or keep ask as the long-term posture.
