---
name: architecture-survey
description: Survey a repository for deepening opportunities, show them as one visual HTML report, then grill the candidate you pick and hand it to interphase.
disable-model-invocation: true
argument-hint: "[module, subsystem or pain point to focus on]"
metadata:
  credits:
    skills: improve-codebase-architecture, codebase-design
    author: Matt Pocock
    url: "https://github.com/mattpocock/skills"
---

# Architecture Survey

Find where the code resists change and propose **deepening**: turning shallow modules into deep ones, so a lot of behaviour sits behind a small interface at a clean seam. The aim is leverage for callers, locality for maintainers and one test surface per module. Speak only the vocabulary in [DESIGN.md](DESIGN.md) (module, interface, implementation, depth, seam, adapter, leverage, locality) and the domain words in the repository's `GLOSSARY.md`.

## 1. Scope by hot spots

Deepening pays off where the code keeps changing, so decide where to look before looking.

- When `$ARGUMENTS` names a module, subsystem or pain point, take it as the scope.
- Otherwise read `git log --oneline --since="90 days ago" --name-only` from the repository root and rank directories and files by how often they change. The top of that ranking is the scope; widen it only when change is spread evenly.
- Read `GLOSSARY.md` and every ADR in `docs/adr/` that touches the scope. An ADR records a decision this survey respects.

Done when you can name the five to ten files or directories the survey will walk, and why each made the list.

## 2. Map coupling

When `graphify-out/graph.json` exists, call the Skill tool with "graphify" and use its ranked entry points on the scoped symbols: `affected` for what depends on a module, `explain` for what a module touches, `path` for how two modules reach each other. The graph is read-only here; the hooks own every rebuild. On shell scripts and prose-heavy repositories, where the skill says the graph under-reports, use grep alongside it. Without a graph, read the imports and call sites directly.

Done when every scoped module has its callers, its dependencies and its dependency category from [DESIGN.md](DESIGN.md) written down.

## 3. Find candidates

Walk the scope and note friction:

- understanding one concept means bouncing between many small modules;
- an interface is nearly as complex as its implementation;
- pure functions were extracted for testability while the real bugs live in how they are called;
- modules leak across their seams;
- behaviour is untested or testable only past its interface.

Apply the deletion test from [DESIGN.md](DESIGN.md) to each suspect. Keep a candidate when deleting the shallow modules would concentrate complexity in one place. Drop a candidate an ADR already settled, unless the friction is severe enough to reopen it; then mark it as contradicting that ADR and say why.

Done when each candidate has its files, the problem in one sentence, the deepened shape in one sentence, its wins in locality and leverage terms, and a strength: Strong, Worth exploring or Speculative.

## 4. Render the report

Call the Skill tool with "visual-explainer:visual-explainer" to produce one self-contained HTML file in the OS temp directory, named `architecture-survey-<repo>-<timestamp>.html`, following [REPORT.md](REPORT.md). Open it and give the owner its absolute path.

## 5. Grill the chosen candidate

Ask which candidate to explore. Then call the Skill tool with "grilling" when it is installed; otherwise run the interview here in rounds:

- Map the decisions the deepened module needs: its interface, what sits behind the seam, its adapters, which tests survive and which are replaced.
- Each round asks every decision whose prerequisites are settled, numbered, in plain text, each with a recommended answer worded so "yes" accepts it.
- Look facts up yourself and put only decisions to the owner.
- Finish when every decision is settled and the owner confirms the shared understanding.

As decisions land, update `GLOSSARY.md` the moment a term settles, creating the file when the first term needs it. Offer an ADR in `docs/adr/` only when the choice is hard to reverse, surprising without context and the result of a real trade-off. When the owner rejects a candidate for a reason a future survey would need, offer an ADR so the next survey skips it.

When the owner wants to compare interfaces, follow [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).

## 6. Hand off

Invoke the interphase pathway skill that fits the work, usually `interphase:feature`, with the settled decisions as the request. interphase writes the spec and the pipeline builds it. The survey itself changes no code.
