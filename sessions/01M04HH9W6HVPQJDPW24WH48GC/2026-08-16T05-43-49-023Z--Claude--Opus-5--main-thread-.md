## What this session did

Ran /agent-gap-audit against the live configuration, then rendered the findings as an HTML explainer. Scope was fixed by the user: characterise the current state completely, recommend nothing.

### Method
- Rebuilt the ledger read-model (`agent-ledger-index.mjs`), then read `index/gaps.json`, `index/agent-baselines.json` and all 46 daily files in `agent-ledger/events/` directly.
- Recovered the real gap categories by hand from the free-text FALLBACK-RATIONALE strings, because the observer's own clustering does not name them (see risks).
- Dispatched two `codebase-analyst` agents in parallel: one mapped the 15 agent definitions against the six governing rules; one traced the eight ledger scripts and their hook bindings.
- Measured the coupling surface myself (grep over skills/rules/lib/hooks) since neither analyst covered it.

### Delivered
- Inline report: 25 gaps in three layers (roster / definitions / observer), reduced to four structural facts.
- HTML explainer at `~/.agent/diagrams/agent-architecture-audit.html` - 10 sections, 5 interactive Mermaid diagrams (capability tree, dispatch sequence, the ledger loop, the classification algorithm, the coupling map), 2 directory trees, full gap cards, tool-grant matrix, all 22 observer clusters.

### Headline measurements (46 days, 2026-07-02 to 2026-08-16, 15,802 events)
- 55 agents on this machine: 15 global, 32 in pathfinder, 6 in project-swiftee, 2 in chinook-project.
- 15,301 agent runs. 8,415 (55%) carry no agent identity.
- Eight agents do 96% of the work. `performance-engineer` ran once. `verification-strategist` never ran.
- 241 fallbacks, only 46% with a recorded reason. 260 denials, 78% carrying no policy reason.
- Zero gaps resolved, ever. Zero `capability_blocked` events, ever.

## What went wrong

### A wrong claim I made and corrected
I first reported the 8,415 unattributed runs as main-thread turns polluting the agent telemetry, reading `emitter: "main"` as a signal. It is a hardcoded string literal at `agent-run-analyzer.mjs:27`, written on 100% of rows unconditionally. The analyzer binds only to SubagentStop, so every record is a genuine subagent completion. The real defect is narrower and unchanged in severity: the hook payload arrives without `agent_type` 55% of the time. Corrected in-session and in the HTML; the HTML never contained the wrong version.

### Tooling
- Chrome extension unavailable (OAuth token belongs to a different claude.ai account). Fell back to Playwright, which blocks `file:` - served the page over a local `python3 -m http.server` on 8791 instead. Server killed; scratch screenshots removed; repo left clean.
- Four of the five Mermaid diagrams initially laid out too wide or too tall and defaulted to a clipped fragment. Restructured each until all five render fully contained. Final verify: 5/5 rendered, 0 console errors, no horizontal overflow at 1440px, 10/10 TOC anchors resolve.

### Skill steps deliberately not run
- Steps 4, 5 and 6 of the audit skill (anti-sprawl gate, report skill, resolve) were skipped by instruction - they produce recommendations or roster mutations.
- The skill's `AGENT_LEDGER_SUPPRESS=1` requirement could not be honoured: there is no way to set an environment variable per Agent dispatch. The two analyst runs are therefore recorded in the ledger as ordinary `agent_run` events. Minor, non-corrupting pollution of this window's counts.

## Prior work worth knowing about
The paused thread `agent-roster-gap-resolution` (01KYERC4Y2XFVQ5GFQRRV0BKTS) covers overlapping ground against a 2026-07-14 SPEC. It was not touched, merged, or superseded here. Whether this thread supersedes it is undecided.
