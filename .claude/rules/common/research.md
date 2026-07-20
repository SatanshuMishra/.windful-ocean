# Research Standard (always-on)

Research is the context on which critical decisions are made; a complete, objective, verifiable picture is the goal. This standard applies to EVERY research task regardless of phrasing — the words "deep research" trigger nothing special.

## Delegate it

- Per delegation-discipline, the main thread never researches inline. Dispatch the `researcher` agent (the primary research worker). `general-purpose` and `Explore` are last resort only.
- Scale the number of researchers to question complexity (token budget ladder):
  - Simple fact-find: 1 researcher, ~3-10 tool calls.
  - Direct comparison: 2-4 researchers, ~10-15 calls each.
  - Complex / breadth-first: bounded parallel fan-out, HARD-CAPPED (e.g. <=6), and only when the question splits into genuinely independent directions.
- Fan out only for breadth-first independent directions; a single focused researcher is the default. Multi-agent research costs ~15x the tokens of a single pass — it must clear that bar.
- NEVER invoke the bundled `deep-research` workflow (it is unbounded, ~97 agents, no cost gate; it caused a 3M-token incident). It is also blocked by a PreToolUse hook. Use the `researcher` agent instead.

## The loop

Every research task runs: plan (multiple rival hypotheses) -> search (broad then narrow; full pages; context7 for docs) -> ground (weight sources) -> disconfirm (counter-evidence pass) -> verify (chain-of-verification; triangulate >=2; URLs resolve; quote-ground) -> synthesize (diagnosticity weighting; For/Against/Alternatives + confidence) -> pre-mortem gate. Detail lives in the `researcher` agent.

## Objectivity

Confirmation bias is the default failure mode; counter it deliberately. Carry multiple working hypotheses; actively seek disconfirming evidence; weight by diagnosticity not volume; present opposing views proportional to evidence (no false balance); run a pre-mortem before concluding. Nothing is "just trust me" — every external claim is independently checkable.

## Citations

Defer to `research-citations.md` for the core rule (verifiable URL inline or `[unverified]`, never fabricate), and extend it:
- Weight sources primary > secondary > blog/marketing.
- Triangulate load-bearing claims across >=2 independent sources.
- Verify each cited URL resolves and quote-grounds the claim.
- Tag each finding with calibrated confidence and match wording to reliability.

## Output contract

- Research returns report-ready findings to the orchestrator; a rendered report is produced only on demand via the `report` skill (`/report`). No raw walls of text in chat.
- Write for a near-novice reader: define every term in plain words on first use, BLUF (answer first), no walls of text; prose only for nuance, everything comparative/relational/quantitative becomes a table/diagram/callout.
- Two archetypes seed the report templates: technology-decision and bug/diagnostic (the `report` skill carries the section templates).
- Research findings are returned to the orchestrator; rendering a report is on-demand, never automatic. Research never silently rolls into implementation.

## See also

`research-citations.md`, `delegation-discipline.md`, `tool-routing.md`, `agents.md`.
