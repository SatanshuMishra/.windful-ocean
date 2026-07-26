---
Status: accepted
Date: 2026-07-26T22:06:04.104Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0018. Deny-by-default design approved; a control-split pass is mandatory because inversion alone introduces a backgrounding evasion

## Context

The solution-architect design landed and is saved at .claude/docs/superpowers/specs/2026-07-26-pre-tool-use-guard-deny-by-default-design.md (windful-ocean). It settles decisions A-H, carries a measured tokenizer probe table, and produced two findings that change the inherited picture. FIRST: deny-by-default alone does NOT close the backgrounding class, and a naive inversion INTRODUCES a hole neither current guard has. SEPARATORS at shell-tokens.mjs:1 holds only and-and, or-or, semicolon, newline and pipe, so a bare ampersand is an ordinary word character; ls ROOT ampersand rm -rf ROOT is ONE segment whose head is ls. Head-only matching against a read-only allowlist would ALLOW that rm -rf. Decision 0011 assumed inversion closed grouping and backgrounding wholesale; it closes grouping only, and then only because paren and brace become the head. SECOND: whole-command scoping (any segment in root implies every head must clear), proposed by the orchestrator as a stronger fix for pipeline blindness, was evaluated and DISQUALIFIED: heredoc bodies tokenize as independent segments with arbitrary first words, so it denies every heredoc in any root-referencing command and resurrects the canonical live false positive for a new reason (python3 not allowlisted). Also measured this session: the scanSegments cost curve past the realistic band - 25.34 ms at 16 KB, 166 ms at 32 KB, 4.1 s at 128 KB, 16.6 s at 256 KB - which sizes the fail-closed cap. Separately reproduced live: the installed 0fe1c02 guard denied a pure read because a stderr redirect matched the redirect alternative in MUTATING while the command text carried a root substring.

## Options

- Adopt the design as written, all six open user calls resolved per the architect recommendations
- Adopt deny-by-default without the control-split pass - rejected: measured to introduce the backgrounded rm -rf evasion, making the inversion a net regression on that class
- Adopt whole-command scoping to close pipeline blindness outright - rejected: heredoc bodies become segments with arbitrary heads, denying every heredoc and resurrecting the canonical false positive
- Two-verdict deny/allow only - rejected: forces a choice between a silent xargs hole and denying every multi-segment store read

## Outcome

Design APPROVED by the user; all six open calls resolved as recommended. (1) The Over-Block Bill is accepted - 14 deny classes, 4 ask classes - bounded by the guarantee that any command not naming the store is untouched. (2) ask is adopted as a third verdict per decision 0015, carrying overlays O1 (store read feeding a sink) and O2 (root path in a variable consumed by a sink). (3) The three silent allow-paths are IN SCOPE in the NARROW variant only: a PreToolUse-only fail-closed entry (runGuardEntry, about 30 LOC plus tests) that denies on exception and on empty or malformed input; runEntry stays untouched for the other five hooks because a global fail-closed change is session-breaking. The roots-length-zero path is DEFERRED - it needs a product judgment about non-git projects. (4) sudo and doas are stripped as prefix words; safe because the exposed head must still clear a read-only allowlist. (5) Interpreters python, python3, node, perl and ruby sit on SINK_HEADS. (6) GIT_READ_SUBCOMMANDS accepted as the 14 listed, with an operand-aware resolver for -C, --git-dir and --work-tree that fails closed on unknown git globals. Mandatory build constraints: the control-split pass MUST carry the fd-dup exemption for an ampersand-digit token after a redirect token or test/unit/hooks/pre-tool-use.test.mjs:139 breaks; MAX_COMMAND_BYTES is 16384 and the cap goes in pre-tool-use.mjs BEFORE scanSegments so shell-tokens.mjs stays frozen; the 12 and 41 corpus figures are FLOORS with no upstream provenance and actual counts must be reported as measured. Implementation order: size cap, then tokenizer characterization test, then the RED corpus commit with verbatim evidence captured, then the inversion. NOT authorized and still open: the session-continuity Stop-hook fix (stop.mjs:5-13 blocks unconditionally, ignoring the documented stop_hook_active loop-breaker).
