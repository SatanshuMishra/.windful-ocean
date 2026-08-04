---
Status: accepted
Date: 2026-08-04T23:31:04.407Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0245. Rewrite the bash gate to parse-then-decide-per-command rather than patch its regexes

## Context

Two independent agents executed .claude/hooks/block-destructive-bash.sh against crafted payloads and confirmed a CRITICAL bypass plus nine further classes. The CRITICAL is an ordering bug, not a weak pattern: the normalizer at :15 collapses newlines to spaces before the :44 chained guard checks for separators, so a newline appended to the exempt wrapper laundered any denied command, silently, exit 0. That includes `gh api -f body=@<path>`, which makes gh read a local private key and POST it. It is the sole gate for gh api and gh pr edit because settings.json permissions.deny names neither. Twelve invariants were derived from the evidence. Only four are reachable by regex; the two that carry the CRITICAL (INV-3 normalization must not destroy decision evidence, INV-4 exemptions scope to one command not to a string) are not. Prior history matters: five earlier fix rounds each patched a finding list and each introduced a new defect on an unnamed path.

## Options

- Full structural rewrite: parse the command string into a list of commands with shlex, decide each independently, delete the chained predicate entirely, make the exemption an argv-shape check against a realpath allowlist, fail closed at every seam
- Minimal fail-closed patch: add newline and <( to the chained set, anchor selfwrap, fail closed on missing python3 and malformed input, and file the rewrite separately
- Report only: commit the finished follow-ups, write the findings up, change no gate code this session

## Outcome

Full structural rewrite, chosen by the user after being shown the three options and the regex-reachability analysis. The decisive argument is that INV-4 and INV-10 become STRUCTURAL under a per-command design: there is no longer a flat string for a prefix to launder, only a list whose elements are judged alone, so the whole laundering family closes including separators nobody enumerated. Patching would have closed the newline instance while leaving the shape of the decision intact, which is exactly the pattern that failed five times. Accepted costs: a parser is more code than a regex, and shlex is not bash so exotic constructs will mis-tokenize. That is tolerable only because the failure direction inverts - an untokenizable construct now routes to ask, where today it routes to silent allow. Latency is not a constraint: python3 -c pass measures ~14ms and the fork is already paid on essentially every invocation. Explicitly rejected as out of bounds: attempting a complete bash parser. INV-11 exists so undecidable input is handled by policy rather than by a pattern pretending to cover it.
