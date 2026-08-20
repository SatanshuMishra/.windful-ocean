---
Status: accepted
Date: 2026-08-20T00:37:42.474Z
Thread-Id: 01M0E8GPWY3BDXBRGXW4KZM8CF
---

# 0632. Compose PR bodies what-first, with a typographic sentence rule and no opening summary

## Context

The pull request body opened with the reasoning rather than the change, and was written for someone who already knew the codebase: dense with symbol names, file paths and internal unit identifiers. Human reviewers are the primary and only audience. Research found the ordering is a house-style call with no measured evidence either way, and that the previous order was ratified by nothing at all. It also found that the reference repository the owner pointed at composes bodies freehand with per-pull-request headings, which a fixed composer cannot reproduce without giving up the property that makes caller text unable to impersonate document structure. Separately, the owner asked for sentence structure to be enforced while explicitly forbidding fragile pattern matching and open-ended edge-case work.

## Options

- Fixed five-section skeleton leading with what changed, plus a typographic-only sentence rule, plus the clarity rules in prose
- Adopt the reference repository's freehand style with per-pull-request headings chosen by the author
- Add a required one-sentence summary field above the first section
- Enforce clarity in code by detecting jargon, file paths and internal identifiers inside caller values

## Outcome

Keep the fixed skeleton and reorder it to what changed, why, risk, verification, links. Freehand headings were rejected because the composer is what makes a caller value unable to forge a section, and trading a hard guarantee for an aesthetic is the wrong direction; the reference style is also single-author habit with no template behind it, and most of its titles would fail this environment's own title grammar. A required summary field was rejected as an addition that would duplicate the title, which already is the one-sentence description and is what the platform surfaces in listings. Detecting jargon or identifiers in code was rejected outright: no closed check exists for whether a stranger would understand a sentence, and every attempt grows an unbounded tail of exceptions. What code enforces is therefore typography alone, in one rule: a prose value begins with a capital letter and ends with a full stop, question mark or exclamation mark, with a closed five-item exemption for externally-owned continuous-integration tokens that must sit at the start of a line. Everything else about clarity is written as six rules into the three surfaces humans and agents actually read, and is declared permanently unenforceable in the specification so a later session cannot mistake it for unfinished work. The bullet ceiling drops from five to three, which serves concision by subtraction rather than by a new check.
