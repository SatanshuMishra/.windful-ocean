Closed every open question the thread carried, on explicit user instruction to proceed on all of them and start the next session with none.

WHAT SHIPPED

Six decision records, 0353 to 0358, one per open question.

0353 — the engine stays in the Workflow sandbox. Verified against the working tree rather than assumed: .claude/lib/mitosis/workflow-sandbox.mjs:269 throws SandboxViolationError('import', 'dynamic import()'), and HOOK_NAMES at :36 is frozen at args, agent, parallel, pipeline, log, phase, workflow, with budget absent. With the SDK host cut by 0352, SPEC B section 7's reason to stay holds again — agent() is the only effector. The consequence is the one that matters: 0325 dropped Part III (codegen decomposition) as MOOT because a Node host restores ESM, so with no Node host Part III is UN-MOOTED and returns as live work, and the inline module twins stay forced.

0354 — Source B is the instrument, and SPEC B's self-named "single largest open question" was answerable from artifacts already on disk, with no probe run. Workflow runs persist <session>/subagents/workflows/wf_<runId>/ holding agent-<id>.jsonl (message.usage per assistant turn: input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens; plus message.model and ISO timestamps), agent-<id>.meta.json (agentType, spawnDepth) and journal.jsonl (started/result per agentId, keyed by a v2 content hash). One measured agent: 76 assistant messages, input 10,244, cache_creation 268,854, cache_read 5,467,420, output 20,734 on claude-opus-5 over 11m45s. Two amendments forced on section 2.1: FOUR token classes not two (cache_read alone was ~20x raw input plus cache-creation, so a two-number instrument understates input cost by more than an order of magnitude), and ATTRIBUTION is the real gap — nothing on disk maps agentId to a label or phase, so the engine must emit its own map.

0355 — the window-fill question is answered at the artifact layer. 0342's Tier 0 and Tier 1 are re-aimed at the main thread: re-derive externally visible state from git and GitHub at resume, re-pin constraints verbatim into every dispatch prompt. Nothing load-bearing lives only in the window, so auto-compaction cannot drop it and 0343 is satisfied with no marker mechanism.

0356 — the SPEC claims only the gated guarantee (every dispatch path but the mitosis verb denied at the PreToolUse gate and in permissions.deny) and says in those words that it is a gate, not tool absence.

0357 — spawn depth closed from existing artifacts. Census of every subagent meta.json on this machine, 5,789 records: depth 1 = 5,637, depth 2 = 73, depth 3 = 2, unset = 77. Depth 3 is reachable and exercised; the new topology removes a layer.

0358 — the residual register is re-cut. Three residuals promoted to stated rules, one to an acceptance criterion (baseline is >=3 runs at pinned repo state with variance), and only the quality-blindness residual stays genuinely open.

VERIFICATIONS RUN

All five mermaid diagrams on the new re-architecture page RENDER. The standing risk was that three constructs were rewritten defensively to proven syntax without ever being seen. The in-app browser refuses live file:// execution (it serves a data: snapshot, so page scripts never run and a copy into a gitignored project directory did not help). Verified instead by extracting the five diagram sources and running @mermaid-js/mermaid-cli@11 over each: five OK, five SVGs produced. This proves they PARSE AND RENDER under mermaid 11, the same major version the page loads from CDN; it does not prove visual layout inside the page's own zoom harness.

Two citation corrections for c1. SPEC B lives at docs/superpowers/specs/2026-08-06-mitosis-core-cost-decomposition-stacking-SPEC.md at the REPO ROOT, not under .claude/docs/specs/ — commit 693d54c moved a different tree. And .claude/lib/superpowers-parallel survives as an UNTRACKED 324K leftover holding graphify-out and tests, 0 tracked files against .claude/lib/mitosis's 97, so it still answers a grep and will hand back stale paths.

WHAT FAILED

First mermaid-cli run failed on all five with "command not found: timeout" — macOS has no coreutils timeout. Re-run without it succeeded.

First amend_criteria call was refused for a 200-character overrun on c5's text; first update_thread call was refused because the risk texts used ASCII hyphens rather than the required spaced em dash. Both re-sent and accepted.

NOT DONE, DELIBERATELY

The leftover .claude/lib/superpowers-parallel directory was NOT deleted. It is untracked and not gitignored, so removing it is unrecoverable and needs explicit user confirmation. It is left in place and recorded as a c1 risk.

The citation census itself was not run — it is c1's actual body of work and is now the single next action.

State left behind: browser preview pane open on the re-architecture page (static snapshot, harmless). Extracted diagram sources and their SVGs are in the session scratchpad under mmd/. The render-check copy inside graphify-out was removed; git status is clean.