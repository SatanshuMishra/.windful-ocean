---
Status: accepted
Date: 2026-08-06T14:07:19.123Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0259. A deny requires the command token in command position within a segment; an ask stays unanchored

## Context

Accepted risk 4 is live and measured wider than recorded: a c5 probe of 56 phrasings found seven false positives, including `git commit -m "fix(gate): deny gh pr create forms..."` denying, which blocks writing commit messages about this very work. The probe also found a new instance of the same root cause outside the PR clauses -- `ls -rf /tmp; rm /tmp/one-file.txt` asks, because the rm/-r/-f conjunction is satisfied from fragments of two different sub-commands. Root cause is has() doing an unanchored substring search over the whole command string. The same probe found the G2/G3 deny surface otherwise complete: only the updatePullRequest GraphQL mutation is open.

## Options

- Leave risk 4 accepted and keep the write-message-to-a-file workaround
- Quote-state lexer in python that blanks quoted spans before matching
- Split the command on shell separators and require the gh token in command position for deny verdicts only

## Outcome

Chosen: split on separators plus command-position anchoring, scoped to deny verdicts. The command is segmented on `;`, `&`, `|` and newline, and every clause is evaluated per segment, so a conjunction can no longer be satisfied from fragments of different sub-commands. Within a segment, the `gh` token must be in command position -- segment start, or after `$(` or a backtick -- allowing a path prefix, leading VAR=value assignments, and the transparent wrappers sudo/env/command/nohup/time/xargs/sh -c. Ask-verdict families keep unanchored matching, because a false ask costs one confirmation while a false deny blocks work outright; this is the same reasoning already recorded for risk row 10. A quote-state lexer was rejected: it needs the bash parsing fidelity ruled out by non-goal 2 and grows the gate back toward the parser that .claude/hooks/CLAUDE.md forbids. Load-bearing prerequisite: the payload extractor must stop collapsing newlines into spaces, or anchoring would silently stop matching multi-line scripts -- the most common agent shape. Accepted residual: a quoted string carrying a separator followed by a command-shaped phrase, e.g. `echo "a; gh pr create b"`, still denies; so does a heredoc body line beginning with a denied phrasing. Real coverage loss is nil, because every form that flips to allow is one where the phrase is quoted text that never executes, and the cheaper evasions of rows 5 through 7 are already accepted as live.
