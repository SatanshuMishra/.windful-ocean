---
Status: accepted
Date: 2026-08-05T15:22:14.202Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0248. The bash gate is a defense-in-depth control at a scoped assurance level, not a security boundary

## Context

Across six sessions the word "secure" was repeatedly read as "unbypassable by a hostile expert", which drove escalating complexity, six fix rounds, and a rewrite that measured worse than what it replaced. The user scoped the requirement explicitly: this is a personal configuration on one machine, not a deployment facing hundreds of adversarial users, and it does not have to be exploit-proof. The realistic adversary is the agent itself - mistaken, overreaching, or prompt-injected - plus user accidents. A determined human attacker is out of scope because that person is the machine owner and already holds unrestricted shell access outside Claude Code, so no PreToolUse hook raises their effective privilege bar. Industry precedent supports naming this: Microsoft's MSRC servicing criteria publishes UAC, AppLocker, DEP and ASLR as explicitly NOT serviced as security boundaries; Chromium documents scenarios as "outside the threat model" by name; Cursor's own docs call its stack "best-effort guardrails rather than a hard security boundary"; OpenHands says the same. Anthropic's own bundled security-guidance plugin nonetheless classifies PreToolUse hooks as genuine privilege boundaries for the model-as-attacker threat model, which is precisely this one - so the gate is worth building, just not worth building as an unbreakable one.

## Options

- Treat the gate as a security boundary and keep hardening until no bypass is conceivable - the implicit posture of the last six rounds
- Treat the gate as a defense-in-depth control with a written assurance level, a named in-scope adversary, and explicit reasoned non-goals
- Leave the assurance level unstated and rely on each session's judgement

## Outcome

Chosen: defense-in-depth control at a scoped assurance level. The acceptance bar is that parser or classifier uncertainty degrades to ask, never to a silent allow - not that parsing is perfect. Non-goals must be written as short declarative sentences each carrying a named reason, because a bare exclusion invites "but what if we hardened it anyway" while a reasoned one answers it in advance. A finding that lands against a stated non-goal is logged as accepted risk, not fixed.</outcome>
<parameter name="scope">thread
