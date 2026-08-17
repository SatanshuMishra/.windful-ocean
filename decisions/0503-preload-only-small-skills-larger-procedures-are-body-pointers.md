---
Status: accepted
Date: 2026-08-17T05:29:44.127Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0503. Preload only skills at or under 4KB; larger procedures become body-carried pointers resolved at generation time

## Context

Decision 0501 assigns each of the 13 agents a preloaded skill. Measurement of the actual assignments showed the design cannot be built as written: all six plugin-owned assignments exceed 4KB - receipts:gates at 16,132 bytes, superpowers:systematic-debugging 9,465, superpowers:test-driven-development 9,015, superpowers:writing-plans 7,053, visual-explainer 6,743, superpowers:receiving-code-review 6,203 - and the project-owned mitosis skill is 14,200. A preloaded body is inlined unconditionally on every dispatch of that agent. The router-plus-side-files pattern that 0501 mandates cannot be applied to any of them, because they live in a plugin cache and any edit is reverted by the next plugin update. Filed under acceptance-as-ceiling rather than folded into 0501, and ratified by the user on 2026-08-17.

## Options

- Preload everything as 0501 assigns - rejected, it inlines 6 to 16KB per dispatch of procedure that is mostly irrelevant to the specific task
- Fork the oversized plugin skills into project-local router-shaped copies - rejected, it inherits maintenance of six third-party documents and diverges silently on every upstream change
- Preload only skills at or under 4KB; carry larger procedures as a pointer in the agent body, read on demand

## Outcome

RATIFIED. Skills at or under 4KB are preloaded through `skills:` frontmatter. Anything larger is delivered as a single generated line in the agent's own body naming the procedure's absolute path, which the agent reads when its duty requires it.

Three properties decided it, and none is a trade against the others.

CHANNEL. An agent's body becomes its system prompt and binds. Preloaded skill content arrives as a separate message, on the same advisory channel that rules files use and that carries the "may or may not be relevant" hedge. Moving the load-bearing instruction from the advisory channel to the binding one strengthens it. This is the same two-channel finding that drove 0470.

FAILURE VISIBILITY. An unknown name in `skills:` logs a warning and spawns the agent anyway, with nothing - it runs blind and looks normal. A wrong path in a body pointer fails on contact, and the U1.3 drift check catches it at build time before it ships.

MEASURABILITY, which is what actually decided it. Pasted content leaves no trace of whether it was used. Opening a file is a recorded tool call, visible in the rebuilt observer and joinable to the procedure path. This thread has now produced three defects of the identical shape - an observer verified by a probe that could not fail, a drift detector silently skipping two thirds of its subjects, a rule that outlived its enforcing code - each returning a clean result indistinguishable from a real one. Choosing the observable option is that lesson applied to this decision.

THE VERSION-PATH PROBLEM, and its resolution. Plugin paths embed a version segment, so a hardcoded pointer breaks on the next plugin update. The pointer is therefore RESOLVED AT GENERATION TIME from the installed_plugins.json manifest rather than written by hand, and the drift check fails when a generated body's path no longer matches the currently resolved one. That converts a plugin upgrade from a silent breakage into a failing check. The resolution logic already exists in this repository and is reused rather than rebuilt: superpowers-prompts.mjs reads the current entry from the manifest and falls back to a semver-descending glob over the cache.

SIMPLICITY. This adds no new machinery. Agent bodies are already generated from shared fragments with a drift check, required for independent reasons at U1.3. The pointer is one more generated line through a system already being built, and the drift check gains a second job it was already shaped to do.

INTERACTION WITH R13. R13's mitigation was stated as "Leads preload their load-bearing procedures". Under this decision a Lead's load-bearing procedure is a body pointer instead, which is MORE reliable rather than less, because the body binds while a preload advises. R13's mitigation strengthens rather than weakens.

LADDER STATUS: unverified-reasoned, not fixed. The agent must still act on the instruction. The difference from the preload design is that failure is detectable - the first standing query after the roster goes live joins a Lead's tool calls against its procedure path - rather than invisible for weeks.
