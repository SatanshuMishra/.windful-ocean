---
Status: accepted
Date: 2026-08-18T23:02:10.480Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0597. The provenance pattern widens by two codepoints, because the bracket ban was never an injection control

## Context

The centralized pull request tool could not express this machine's own model identifier, because its provenance pattern forbids brackets. The tool refused, the shipping agent substituted a different model string, and the body then permanently attributed the work to a model that did not do it - pull request bodies are immutable by rule, so every such record is uncorrectable, and it would recur on every machine pull request from a 1M-context session. The bracket ban was treated as possibly deliberate, since the value is rendered into a Markdown document that can never be edited.

## Options

- Escape the provenance value at render time
- Widen the character class by the two bracket codepoints
- Normalise the model id at the call site and leave the tool alone
- Leave it and accept a false model string on every machine pull request

## Outcome

Widened the class by exactly two codepoints, none removed, hyphen still literal, proven by a Unicode census across the full codepoint range. THE BAN WAS NEVER A CONTROL, established before the change rather than assumed: no rationale was ever stated, the line was written once and never touched, all eight pre-existing rejected cases were structural with zero dangerous-character cases, and the value is interpolated raw with no downstream escaping. The disconfirming evidence that settled it - working Markdown links and images ALREADY render today in why, what, verified, risk and link of the same immutable document, so a character class cannot be the control against link injection when link injection is not stopped. Brackets are inert alone here because every link vector also needs parentheses, which stay refused; nine guards assert that, and the brackets-with-parentheses guard only becomes load-bearing now that brackets are legal. Rejected escaping at render because it touches the composition path every field shares, changes existing output, and MANGLES THE VERY VALUE THE FIELD EXISTS TO RECORD, defeating the verbatim requirement. The proof is the pull request itself: 220 was opened by the tool it fixes and its provenance carries the bracketed model id verbatim. Filed rather than folded: those five sibling fields admitting complete Markdown links and images into an immutable published document is a real pre-existing exposure, and reference links need no parentheses so they are now constructible in provenance, remediable by adding the opening bracket to BLOCK_OPENER.
