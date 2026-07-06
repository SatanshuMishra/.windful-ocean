# Tool Routing — Map, GPS, Street View

## The three layers

Four read/edit layers are available; pick by what the question needs. Default to orienting on the map, then drilling with the precise oracle. Do not default to one layer exclusively.

- **graphify = the map.** A knowledge graph of the project (modules, symbols, file/import/inheritance relationships, communities). Use it to ORIENT: where does X live, what clusters with it, how do modules and imports connect, where are the entry points. `graphify query "..."`, `graphify path A B`, `graphify explain <node>`. Built and kept fresh automatically; querying it is read-only and, for code, token-free. The map is RELIABLE for files, imports, and inheritance — it is NOT the symbol-call oracle (its call-graph recall is too low to gate parallel-safety; see the dependency-oracle layer).
- **native LSP call hierarchy = the dependency ORACLE (GPS).** Type-accurate caller/callee facts — the source of truth for "who calls / who is called by" and for semantic dependency edges. Use it to DRILL once the map has placed you, and whenever a dependency fact is load-bearing (parallel-safety, refactor blast radius). Corroborate the seams the oracle cannot see — dynamic dispatch, dependency injection, FFI, SQL, codegen — with targeted reads.
- **Serena = edit-only.** Symbol-targeted edits in large files: `replace_symbol_body`, `insert_after_symbol`, `rename_symbol`. Serena is NOT the navigation oracle — use native LSP for caller/callee facts (native LSP edit ops remain unshipped, anthropics/claude-code#40282 open, which is the only reason Serena is retained here).
- **native grep / Read / Glob = street view.** Plain text or regex over a known location, small files, logs, config, generated output. Use when you already know where to look.

## Routing

1. **Orient on the map.** Start with graphify for "how does this fit together / where is X / what connects to Y" in a large or unfamiliar codebase.
2. **Drill with the native LSP oracle** for precise relational facts (every caller, every callee, refactor blast radius) and to confirm any dependency that gates parallel-safety. Corroborate dynamic/DI/FFI/SQL/codegen seams with targeted reads.
3. **Edit with Serena** for symbol-targeted changes in large files.
4. **Grep / Read** for local, known-location, plain-text work.

The order is a heuristic, not a law: for a known identifier, grep is the correct first call; for a concept, the map; for a load-bearing dependency fact, the LSP oracle.

## Safety rail (the map can lag the diff)

The graph reflects the last build. The Stop-hook refresh shrinks the gap to one turn, but it is not instantaneous, and the map is structural, not a live symbol index. So:

- For files edited since the last refresh, or whenever you need EXACT CURRENT symbol facts (precise call sites, signatures, definitions), verify with the native LSP oracle rather than trusting the map. The map is structural, not a live call index.
- This is diff-local: only the just-edited files are suspect, not the whole graph. Verify the recent diff and genuinely-live precise queries; do not re-verify everything. Derived artifacts are hints; the code wins.

## Lookup vs evaluation

"Lookup" (orientation / locate / verify) is exactly this routing, followed by every tool-equipped agent — there is no separate lookup agent. For broad or expensive read-only sweeps, dispatch `codebase-analyst`: it is the primary locator and relational mapper. The built-in `Explore` is a last-resort fan-out only, after `codebase-analyst`. Evaluative agents (`code-reviewer`, `security-reviewer`, `debugger`) and the fact-check skill CONSUME lookup; they are not lookup agents.

For research tasks — external best-practices/standards/tech-stack research, or investigating a bug/system to understand and synthesize before acting — dispatch the `researcher` agent (see research.md). `codebase-analyst` remains the primary locator and relational mapper for code; `researcher` consumes that locating and adds web research, objectivity, and synthesis. `general-purpose` and `Explore` stay last-resort.

## Setup

- graphify is provisioned per project at SessionStart (built if absent, refreshed for non-git projects) and kept fresh once per turn by a Stop hook. If `graphify query` reports no graph yet, a build is in flight — fall back to Serena / native until it lands.
- On first use of Serena in a project, call `activate_project` (or onboarding) once so its language servers index the repo.

## Precedence

For code mutations, rules/common/delegation-discipline.md supersedes this file: the main thread dispatches a subagent even for a small edit. The routing above governs the orchestrator's own reads and judgment artifacts, and every subagent's reads.

Rationale: the map wins for orientation in a large or unfamiliar codebase; native LSP wins for precise / live relational facts (caller/callee, blast radius); Serena wins for symbol-targeted edits in large files; native wins on latency for local known work. graphify is local and token-free for code; Serena usage is recorded in its dashboard (localhost:24282) for periodic review.
