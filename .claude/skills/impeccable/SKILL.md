---
name: impeccable
description: Use when writing, changing, designing, critiquing or auditing user-interface code in any framework, including web (HTML, CSS, React, Vue, Svelte), Flutter, SwiftUI, UIKit, AppKit, Jetpack Compose, Android views, WinUI and React Native, on phone, tablet, desktop or web. Agents building UI invoke it as impeccable standard with platform keys apple, android, windows or web. Not for backend-only or non-UI work.
version: 3.1.1
user-invocable: true
argument-hint: "[standard [apple|android|windows|web ...] · craft|shape · audit|critique · animate|bolder|colorize|delight|layout|overdrive|quieter|typeset · adapt|clarify|distill · harden|onboard|optimize|polish · teach|document|extract|live] [target]"
license: Apache 2.0. Based on Anthropic's frontend-design skill. See NOTICE.md for attribution.
allowed-tools:
  - Bash(npx impeccable *)
---

## Routing

1. When the first word of the arguments is `standard`, or when this skill was loaded by the model itself or by another agent or skill rather than by a person typing `/impeccable` in their own message, read [reference/standard.md](reference/standard.md) and follow it. It owns the whole flow; nothing else in this skill applies.
2. When a person typed `/impeccable` in their own message with any other first word, or with no arguments, read [reference/assistant.md](reference/assistant.md) and follow it.
3. Resolve every path relative to this skill's base directory, the folder this SKILL.md is in.
