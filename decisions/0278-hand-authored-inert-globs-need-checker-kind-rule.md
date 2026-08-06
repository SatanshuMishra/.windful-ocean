---
Status: accepted
Date: 2026-08-06T23:43:10.425Z
Thread-Id: 01KZCAGBAH55F8AR1ZXJQT8JRP
---

# 0278. Hand-authored inert globs are not survivable; the declarable class must be enforced by a checker kind rule

## Context

0273 adopted the inert basis and accepted explicitly that correctness moves to glob authorship, higher stakes and unreviewed in a solo repo. The first authored set, committed at 369490f across B1-B6 and G1-G5, was audited against a per-invariant threat-surface map and failed in BOTH directions; the auditor retracted its own clearance of the B track when pressed on symmetry. G sets declared four executable test files inert while G quantifies over any agent-issued command, which the Bash hook cannot see inside a Node child process and which no lint scans under tests/. B sets declared block-destructive-bash.sh inert for all six B ids, a file that runs on every Bash call with the working tree as the live gate, plus test files that write executable content while node --test runs files in parallel and the B oracles read their subjects from disk at run time. Both routes yield a machine-proved INERT verdict over a change that falsifies the invariant. This happened on the first attempt, under review, in the very thread whose subject is this hazard. Independently the checker review found a lone ** glob compiles to a universal matcher nothing rejects, the same failure reachable by one careless registry edit.

## Options

- Ship 369490f as authored - rejected, two independent critical routes to a false green, one firing on every Bash call rather than only under npm test
- Narrow the globs by hand and ship - rejected, hand authorship is the demonstrated failure mode and a second hand pass has no reason to succeed where the first failed
- Delete inert_when from G1-G5 and narrow B1-B6 to the threat model plus the coverage glob - fail-safe as an immediate fix but leaves authorship unconstrained for the next author
- Enforce the declarable KIND in the checker then re-derive the sets from that rule - ADOPTED
- Abandon the inert basis and revert to total prose coverage - rejected, 0272's measured cost stands and the mechanism raises the assurance floor where it is sound

## Outcome

The inert basis does not ship on hand-authored path enumerations. The checker must enforce which KIND of path may be declared inert - reject any inert_when path that is not *.md or *.json, reject .claude/rules/**, reject .claude/settings.json, reject each id's own source, and reject a glob that matches the universe - and the sets are re-derived from that rule rather than authored. Immediate fixes, both fail-safe: delete inert_when from G1-G5 entirely, since once the executable paths come out only the coverage glob remains and it can never fire alone because every real pull request touches something else, and a vacuous declaration is worse than none because it reads as a considered safe-list; narrow B1-B6 to docs/security/bash-gate-threat-model.md plus docs/invariants/coverage/*.json, which nothing executes, no oracle reads, and which is not B's source. That leaves a genuine basis at roughly one-fifth scope, since a threat-model-edit pull request is a real recurring shape. Effect on 0273's arithmetic: its estimated 14 of 17 declarable is superseded - M1, M2 and M6 were already correctly prose-only, G1-G5 are not path-declarable over anything the runtime executes or any gate reads as configuration, and B1-B6 survive only at reduced scope. One asymmetry is load-bearing and must not be flattened: G's failure is checkable per file, since executability is a property of a file, which is why a kind rule can rescue G; M2's failure is not, because it quantifies over future gates whose host is unknown, so no per-path test can ever fix M2. What this gives up, plainly: the payoff measured in 0272 shrinks by roughly four fifths, and the mechanism now costs a checker change it did not originally need.
