OPEN QUESTIONS AND FLAGS, recorded at the user's instruction for resolution in a fresh session alongside deepening the architecture understanding. Read the report first; it is the only artifact that carries the corrected account.

== OPEN QUESTIONS, worst first ==

Q1. DOES THE AUTHORITY SPLIT STAND? The directive says graphify MUST determine parallelizability. 0364 splits it: graphify owns surfaces, clusters and file scopes, but the cut-edge set gets one bounded oracle confirmation inside Decompose. My counter-evidence is a SINGLE measurement of Graphify 0.9.1 on a TypeScript project (specs/2026-06-29-mitosis-design.md:60) while the installed build is 0.9.5 and this repo is mixed-language. That is real evidence but not strong evidence, and I may be over-weighting it because it is the only number that exists. 0364 is RECORDED BUT NOT USER-RATIFIED and it partly contradicts a direct instruction. If the user overturns it the design collapses back cleanly to graphify-alone; the seam was kept clean deliberately.

Q2. WHAT IS STEP 5? The directive's flow reads decompose, cluster, plan per cluster, implement, then "5. ...". I assumed review then integrate then ship, from the existing R1-R6 census. Never confirmed.

Q3. SHOULD THE DIRECTIVE AND DESIGN BRIEF BE CORRECTED? Both assert no numeric graphify recall figure exists in-repo. False. The directive is what a preflight points the next session at FIRST, so the falsehood is positioned to be re-absorbed. I did not amend them because they record what the user actually wrote.

Q4. INLINE MERMAID? The report pulls mermaid from jsdelivr and fonts from Google. It renders only when served over HTTP with network. Inlining makes it self-contained at a cost of roughly 3 MB.

Q5. AMEND c5's DIAGRAM COUNT? The criterion says five render-verified diagrams; there are ten, all verified. The criterion predates the report's growth.

Q6. RENUMBER THE FIGURES? Captions run 1, 2, 3, 4, 7, 8, 9, 10, 11, 12. Figures 5 and 6 were deliberately deleted and survivors never backfilled.

Q7. THE pillars.md ONE-CLAUSE EDIT? User ruled out attaching any measurement (0361) and I accepted. I then offered a narrower edit making the worked example POINT AT tool-routing.md rather than restate its verdict, which would make pillars more purely a principles document. No answer given.

== FLAGS, technical ==

F1. THE CENSUS HAS A KNOWN HOLE. It was scoped to .claude/workflows/mitosis.js and claimed exhaustiveness there, but mitosis.js:4894 instructs the Parallelize phase to read and follow plan-to-task-graph's SKILL.md, which was never audited. A DELETE-class codebase-read instruction could be hiding inside it, and that is the likeliest place one was missed. Same shape at mitosis.js:4903, which tells an agent to read the engine's own source and infer the runArtifacts contract.

F2. THE SLICE FUNCTION IS UNDER-SPECIFIED ON RELATION TYPES. 0363 defines the boundary set as links with exactly one endpoint inside the cluster. But contains is 9,380 of 13,689 links and is file-to-symbol containment, not a dependency; rationale_for (35) links prose to code. The SPEC must name which relations count as dependency edges for cut-edge purposes, or the oracle drowns in non-edges.

F3. EDGE ORIENTATION IS UNVERIFIED. G13 was downgraded because cut-edge detection does not need direction. Wave ordering does, and I asserted the per-link source and target fields suffice. Nobody has checked that graphify orients calls edges consistently caller-to-callee. [unverified]

F4. Six nodes carry no source_file. The slice function must tolerate them rather than throw.

F5. Two census items unresolved: the default model when the dispatch options omit it, at mitosis.js:4908 (Parallelize) and mitosis.js:3314 (divergence check). [unverified]

F6. THE REPORT FOOTER WAS EDITED OUTSIDE THE AUTHORIZED RANGE. My instructions to the section-17 agent conflicted: do not touch anything outside section 17, and leave zero tool-routing.md:8 strings file-wide. The footer carried both the wrong citation and the refuted recall sentence. The agent made three minimal footer corrections and flagged them rather than choosing silently. Accepted, but the footer now differs from the pre-session backup at scratchpad/section17-backup.html.

F7. EVERY DIAGRAM OPENS SHOWING ITS TOP QUARTER. The viewport is 578px while the diagrams are 1,100 to 2,200px tall and the canvas loads at scale 1. By design, with pan, zoom and expand controls, but it shapes the first impression of figures 8 through 12.

F8. SPEC B ITSELF IS UNTOUCHED AND NOW STALE. c1 is line-by-line review of the 2026-08-06 SPEC B document; this session corrected the REPORT's citations, not that document's. The report, the directive, the brief and SPEC B now disagree with each other, and the report is the only correct one.