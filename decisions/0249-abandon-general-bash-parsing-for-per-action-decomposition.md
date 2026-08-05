---
Status: accepted
Date: 2026-08-05T15:22:30.054Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0249. Abandon general bash parsing; decompose the five protections into five per-action controls

## Context

Decision 0245 approved rewriting the gate to parse-then-decide-per-command because regex patching could not reach the wrapper-plus-newline laundering bypass. That rewrite failed: two independent reviewers returned BLOCK, and side-by-side measurement found six paths where it was weaker than the regexes it replaced. Research confirms the approach itself was the error, not its execution. LangSec calls hand-coded parsers for complex grammars indistinguishable from execution engines for exploits coded in the input bytes, and every divergence from real bash is a silent allow. No available parser claims full bash fidelity - bashlex has no heredocs, tree-sitter-bash is a concrete syntax tree for editors, mvdan sh documents its own semantic limits, shlex disclaims being a shell parser. Independent research against Cursor's denylist proved every listed command has infinitely many unlisted equivalents. Crucially, four of the five protected actions do not require understanding bash at all: merge can be removed as a capability server-side via branch protection; PR edit and PR create are small closed enumerable API surfaces; guardrail tampering is path matching. Only exfiltration needs argument-shape detection, because no capability can be removed - an agent must be able to read files and make network calls.

## Options

- Continue fixing the parse-then-decide rewrite - a seventh round
- Revert to the regex gate and patch the newline hole - the approach 0245 already rejected
- Delegate to a maintained third-party bash parser and keep one general gate
- Decompose into five per-action controls, most of which need no shell parsing

## Outcome

Chosen: per-action decomposition, roughly 150-250 lines replacing 1438. Branch protection for merge; small closed-surface denylists for PR edit and PR create; path matching plus chflags friction for guardrail files; a narrow parser over named file-reference flags on named network commands for exfiltration. Supersedes 0245. Recorded against itself: five heterogeneous controls create five drift surfaces where the monolith had one, and the exfiltration parser still has a differential space - a python3 -c invocation using a built-in HTTP client would evade a named-command list. Mitigation is that any unrecognized command carrying a file-reference-shaped argument must fail to ask. The decomposition is a starting shape to revisit, not a closed spec.</outcome>
<parameter name="scope">thread
