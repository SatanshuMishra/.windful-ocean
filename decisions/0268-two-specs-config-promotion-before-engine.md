---
Status: accepted
Date: 2026-08-06T19:29:59.246Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0268. Split the re-spec into two specs, config promotion landing before the mitosis core

## Context

The user asked for one new SPEC covering five areas: (a) token and latency cost from plan to ship, (b) decomposing the multi-thousand-line engine, (c) stacked PRs replacing the blocking-PR architecture, (d) the fix pipeline dropped from scope, and (e) a staging/live split so config edits do not reach running agents until an explicit sync, with the sync guaranteed to run rather than merely suggested. Context exploration on 2026-08-06 found that live global config is not one mechanism but four divergent linkage regimes into the .windful-ocean working tree: whole-directory symlinks for skills, agents, lib, docs, workflows, notes, sounds, CLAUDE.md and keybindings.json; a real hooks directory holding 26 per-file symlinks plus 4 live-only files; a real duplicated rules tree whose contents currently match but which holds an untracked live-only rules/context7.md that is loaded into every session; and settings.json as a real file that has ALREADY diverged, with live granting Bash(node:*) and Bash(ln -sfn:*) where the repo copy carries five narrow node .claude forms, plus live-only model and pluginConfigs keys and a different plugin enablement set. Claude Code writes settings.json itself through permission prompts, model selection and plugin toggles, making it a two-way surface that a one-way promotion would clobber. Every MSP of the engine rebuild writes into .claude/lib, .claude/workflows and .claude/hooks, all live-linked.

## Options

- One SPEC covering all five areas, on the argument that mitosis Ship is where the sync guarantee gets enforced so they are one system.
- Two SPECs with config promotion first: SPEC A covers (e), SPEC B covers (a)(b)(c) with (d) dropped.
- Two SPECs with the engine first and config promotion second.

## Outcome

Approved by the user on 2026-08-06: two SPECs, config promotion first. SPEC A covers (e) alone and lands first, because rebuilding the engine under the current linkage means hot-swapping the engine and its guard hooks underneath running sessions, including the session doing the rebuilding. SPEC B covers (a), (b) and (c); (d), the fix pipeline, is dropped entirely and may be brainstormed separately later, which also removes the 2026-07-30 document's MSP-12 capstone and its whole section 10. SPEC B is ordered: land token telemetry, then codegen the twinning tax, then stacked PRs. The dynamic-import question that would have gated SPEC B's shape is already settled separately. Neither SPEC inherits decision numbers, step-N chaining, or citation authority from the 2026-07-30 document.
