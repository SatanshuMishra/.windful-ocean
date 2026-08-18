---
Status: accepted
Date: 2026-08-18T01:25:17.688Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0551. Agent specs become JSON data rather than weakening the determinism census

## Context

Classifying agent-specs as scanned engine source took the substrate branch from 19 failures to 2 and restored phase-parity and dispatchable-agent-schema-capable, but with enumeration no longer halting the census actually runs and finds a real violation: agent-spec-store.mjs line 57 does a dynamic import whose specifier is not a string literal, so the census cannot tell which module it loads and refuses to guess. The implementer established this is deliberate policy rather than an oversight - no other engine module in the mitosis library does a dynamic import, and determinism-lint.test.mjs line 366 explicitly pins a module specifier held in a variable to halt. There is no escape hatch, and because every file in the engine root is censused there is no placement inside it where a dynamic import is legal. The implementer refused to choose between the two resolutions on the grounds that one of them changes the verification standard's implementation, which an agent must not legislate. That refusal is correct and is why this record exists. Supersedes the recommendation in 0550, which was written before the precise violation was known.

## Options

- Convert specs to JSON data files read with readFileSync and JSON.parse, removing the dynamic import entirely
- Give the determinism census a declared allowance for a loader whose target directory is itself in census scope
- Exclude agent-specs from the census after all, restoring green by recreating the blind spot
- Relocate the loader outside the censused tree so the violation is no longer visible

## Outcome

Specs become JSON. Each store entry is a name.spec.json data file read with readFileSync and JSON.parse, and validateAgentSpec runs unchanged over the parsed object. The dynamic import disappears rather than being permitted. The decisive argument is the same one that shaped the retirement census: a property that is structurally impossible beats a property that is merely checked. A JSON file CANNOT contain Date.now, so spec determinism stops depending on a census noticing. Nothing in a spec was ever computed - fragments and skills are names, and procedure pointers are resolved by the generator at generation time, not by the spec - so the specs were only modules because the fixture precedent happened to be one. JSON is the honest expression of what they are. The declared allowance was rejected because relaxing a verification instrument to fit new code is a permanent weakening bought with a one-time saving, and because its condition is subtle enough to be misapplied later. Exclusion and relocation were rejected as restoring green by hiding the finding. The cost is accepted and is real: four completed wave branches carry thirteen spec files authored as .spec.mjs and must be converted. The conversion is mechanical - each spec is a plain object literal - and the loader gets simpler, not more complex. Three Pillars: Quality over Speed, and rework is a speed cost.
