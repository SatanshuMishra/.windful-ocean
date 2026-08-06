---
Status: accepted
Date: 2026-08-06T16:46:34.252Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0262. The guardrail exfiltration branch requires the at-file shape, not a bare path mention

## Context

G5's credential branch fires on a secret path plus any of three network signals, one of which is a bare URL scheme token. Applying the same shape to the guardrail branch would have made it fire on the pr-create invocation itself: `node "$HOME"/.claude/lib/git/pr.mjs pr-create ... --link https://github.com/...` carries a guardrail path matching the existing guardpath regex and a URL in the same command. That is the single most-run command this whole thread exists to protect, and making it ask on every call carrying a link would be a self-inflicted wound. Every guardrail exfiltration case the probe measured — six of them, including an absolute-path form — carries an at-prefixed file reference.

## Options

- Same shape as the credential branch — symmetric, but makes pr-create with a --link ask every time
- Require the at-file shape — covers every measured case, silent on pr-create
- Keep the bare-mention shape and exempt pr-create — re-adds the self-exemption this same criterion just deleted

## Outcome

Require the at-file shape, allowing an absolute prefix so `@/Users/me/.claude/settings.json` matches alongside `@.claude/settings.json`. Deliberately narrower than the credential branch and not to be widened without re-measuring the pr-create collision. The third option was rejected on sight: c6 deleted the pr-create self-exemption as a maintenance hazard, and re-adding an exemption to buy a wider matcher trades the same hazard back for less.
