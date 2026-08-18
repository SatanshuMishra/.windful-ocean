---
Status: accepted
Date: 2026-08-18T02:46:19.127Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0559. Pointer resolution partitions specs per host rather than scoping the whole check away

## Context

Pull requests 205, 206 and 207 failed both repo-checks and test in CI on one shared cause: composing a spec that carries a plugin-skill pointer needs the plugin manifest at HOME/.claude/plugins/installed_plugins.json, which exists on the developer machine and does not exist on a GitHub runner. Different skill each time - receipts:gates, superpowers:writing-plans, superpowers:receiving-code-review. PR 208 was green only because researcher's spec happens to carry no plugin pointer. Investigation established the dependency is deeper than the file merely being absent: the composed body EMBEDS a host-absolute path, verifier.md line 33 reading receipts:gates followed by an absolute path under the developer's home carrying the version segment 0.3.0. A different HOME therefore composes a different string, so byte-comparison of a procedure-carrying spec cannot be green on a runner whether or not a manifest exists. SPEC section 6a makes that embedding BINDING on U1.3 by design: pointers are resolved at generation time from the manifest rather than hand-written, precisely so a plugin upgrade becomes a failing drift check instead of a silent breakage. Precedent existed for the narrow question - commit 075fbcc8 on main scoped the observer's skill-resolution census to hosts carrying a plugin manifest.

## Options

- Scope the whole composition check to hosts with a manifest, following 075fbcc8
- Partition specs per host: compare procedure-free specs unconditionally, defer only procedure-carrying ones and name them
- Commit a fixture manifest and resolve everything against it
- Stop embedding the absolute path so bodies become host-independent

## Outcome

Partition, not whole-check scoping. When the manifest is present nothing changes and behaviour is byte-identical to before. When it is absent, specs carrying no procedures are still composed and byte-compared UNCONDITIONALLY, and only procedure-carrying specs are deferred, named individually with their references in the output. Every other failure still halts - a malformed reference, a plugin missing from the manifest, a reference resolving to no readable SKILL.md - with two tests pinning that the deferral is not a catch-all. Whole-check scoping was rejected because it discards coverage that survives perfectly well: per branch it would have thrown away 3 of 4 real byte-comparisons on 205, 1 of 3 on 206, 1 of 5 on 207 and 1 of 1 on 208. The resolution LOGIC is separately covered for real in CI against a committed fixture manifest, proven load-bearing by deleting it and watching three tests redden. Rewriting the bodies to be host-independent was rejected as reversing a binding SPEC resolution, which an agent may propose but never legislate. The consequence must be recorded rather than left implicit: SPEC section 6a's guarantee that a plugin upgrade becomes a failing check holds on a host where the plugins are installed and can NEVER hold in CI, because the mechanism is host-bound by construction. That is a permanent property of the design, not a gap this unit left, and the next reader will otherwise assume CI covers it.
