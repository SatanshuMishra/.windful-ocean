---
Status: accepted
Date: 2026-08-05T15:22:40.773Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0250. Archive the rejected rewrite and restore HEAD's regex gate as the live guard

## Context

The hook is live by symlink, so whatever sits in the working tree is what guards the machine. The uncommitted rewrite was weaker than HEAD on six paths and carried BLOCK verdicts from two independent reviewers, while HEAD carries the wrapper-plus-newline laundering hole the rewrite had closed. Neither is safe and they fail on different paths, so this is a trade rather than a free rollback. Under the adversary this gate is actually for - a mistaken or injected agent, not an exploit author - HEAD's single hole is materially less likely to be emitted accidentally than the rewrite's six, which include a comment containing an apostrophe desyncing the lexer and attached flags being invisible to token equality. The rewrite is also destined for wholesale replacement by the per-action decomposition, so keeping reviewer-blocked code live has no upside. It still holds genuine value worth preserving: the structural INV-4 fix, realpath exemption identity work, and an expanded test suite.

## Options

- Keep the rewrite live because it closes one CRITICAL that HEAD still has
- Discard the rewrite outright and restore HEAD
- Archive the rewrite to its own branch, then restore HEAD as the live gate
- Disable the gate entirely and let the wrapper fall back to ask on everything

## Outcome

Chosen: archive then restore. The rewrite is preserved at commit 21ae349 on local branch archive/gate-parser-rewrite-2026-08-05, 1663 lines across 4 files, not pushed and the only copy. The working tree now holds HEAD's 100-line regex gate, smoke-tested live: a merge payload returns a proper deny verdict and git status returns no objection. Accepted consequence, to be closed by the decomposition: wrapper-plus-newline laundering is reopened, and the exfiltration, graphql, git-checkout-of-the-hook and perl-of-the-hook paths remain open exactly as they were on HEAD and main all along. Rejected the fourth option because falling back to ask on every command is the prompt-fatigue failure mode the research warns against.</outcome>
<parameter name="scope">thread
