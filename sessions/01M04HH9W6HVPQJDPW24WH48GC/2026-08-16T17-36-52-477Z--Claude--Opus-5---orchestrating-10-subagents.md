Designed the replacement roster and, after the user expanded scope mid-session, the replacement observer. Delivered as one updated HTML explainer at ~/.agent/diagrams/agent-roster-rebuild-recommendations.html (16 sections, 8 Mermaid diagrams, 27 tables). NO config file was edited in either round.

ROUND 1 — the roster. Four parallel lanes: Claude Code subagent mechanics, external multi-agent best practice, full machine inventory + coupling surface, and extraction of the prior audit. Produced a 13-agent roster in four bands (Leads opus/dispatch-capable; Makers sonnet/no-dispatch; Verifiers; Scribe), replacing 56 user-owned agents. Core move: only Leads hold the Agent tool, so the model tier is enforced by tool grant rather than prose. Three mechanisms proposed: Work Order, Receipt, Ladder.

ROUND 2 — corrections and the observer. The user rejected the round-1 loop-termination design (round caps + maxTurns) as guarding an effect rather than eliminating a cause. That critique was correct and the section was rewritten: the reviewer receives a CLOSED acceptance set and rules per criterion; each criterion reaches a terminal status from the receipts honesty ladder; termination is a property of the state machine, not a budget. maxTurns demoted to a crash guard.

Four more lanes plus two empirical probes: observer autopsy, local-telemetry research, receipts/mitosis invariant mapping, skills inventory, a binary probe of the agent frontmatter schema, and a live context-visibility test.

WHAT WAS FOUND WRONG AND CORRECTED
- Documentation conflicted with itself on the agent frontmatter schema. Resolved by reading the Zod schema out of the installed binary (2.1.233): 19 fields exist in the markdown format, not 5. Unknown keys are silently ignored.
- The prior audit's Fact 1 ("15 documents, not one system") is partly wrong, and I had repeated it. A live probe proved subagents DO receive CLAUDE.md and all rules files — but on a <system-reminder> channel headed "may or may not be relevant", while the agent body is the binding system prompt. Restating load-bearing rules per agent is therefore correct architecture; the defect was that it was hand-maintained and unverifiable.
- My own round-1 claim that the old taxonomy was baked into stored data was wrong. Classification already ran at read time; the classifier itself is simply bad (18-word first-match substring scan).

HARD BLOCKER FOUND
The new mitosis engine's dispatchable-agent-schema-capable gate fails if any dispatchable agent omits StructuredOutput from tools:. All 15 current agents omit it. Every one of the 13 must declare it.

KEY BRIDGE FOUND
receipts.config.json is missing agent.loop_skills, so G17's trajectory store does not exist. The new observer IS that store — it is the missing half of a gate already in force. Also missing: gates.G13.coverage_command (G13 never runs) and gates.G6.surfaces.

MEASUREMENT THAT GOVERNS THE DESIGN
CAPABILITY-BLOCKED is visible to every agent and was emitted zero times across 15,573 runs. Visibility is not compliance. No part of the design may depend on an agent volunteering anything.

NOT DONE / DEFERRED
- c3 is NOT complete: the architecture is designed but NOT approved. The user ended the session asking for specific instructions before any next step.
- Three items left genuinely open in report section 14: which duplicate skill wins (claude-security vs security-reviewer), what fills the three skill gaps, and the unmeasured per-dispatch context cost.
- One inconsistency in my render brief (claimed two of four facts corrected, marked one). The renderer followed the per-card content and the page is correct as shipped.