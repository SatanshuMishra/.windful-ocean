---
Status: accepted
Date: 2026-08-17T04:54:55.423Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0501. The approved target architecture: 13 agents in four bands, with dispatch and skill invocation held by the Leads

## Context

c3 required the target architecture to be designed AND approved by the user. It is approved as of 2026-08-17. This record freezes what was approved, so the SPEC cites one definition instead of reassembling 18 records - four of which carry premises that moved and are corrected only in 0500. Approval followed a round in which every load-bearing mechanism was tested rather than assumed: the skill-preload path was traced in the shipping binary, the side-file exclusion was confirmed by a probe with pre-registered falsification criteria, the observer payload contract was read from two independent extraction points, and every decision in the set was checked against live state.

## Options

- Extend the existing 15-agent roster incrementally - rejected across the thread; the defects are structural, not additive
- Approve the 13-agent four-band design as specified
- Defer approval pending the last untested mechanism (R13) - rejected; R13 narrowed to the Lead band and is a named risk, not a blocker

## Outcome

APPROVED. The definition, in the four terms c3 names.

ROSTER SHAPE. Thirteen agents in four bands: Lead, Maker, Verifier, Scribe. Four Opus Leads - delivery-lead, architect, investigator, researcher. Nine executing agents across the other three bands.

WHO MAY DELEGATE. The Agent dispatch tool is held by the four Leads only. The nine executing agents do not delegate. No agent gets slash-command access, because a dispatched subagent receives a system prompt and tool list rather than the session's command layer - a platform fact, not a configuration choice.

TOOL GRANTS. The Skill tool goes to the four Leads only. The nine others reach skills solely through the `skills:` frontmatter field, which was confirmed to inline each named skill's entire SKILL.md body at spawn with no tool gate. The interlock is tighter than the design originally assumed: the skill INDEX is itself gated on the Skill tool, so an agent holding neither the tool nor a `skills:` field receives no skill content at all - the live state of all 15 current agents, and why skills have never influenced them. Obligations live in agent bodies, the binding channel, generated from shared fragments with a drift check; rules files carry shared reference only and are delivered eagerly and in full to every subagent on every dispatch.

HOW THE CONFIGURATION OBSERVES ITSELF. One cheap append per run, everything else at audit time. The record persists agent_id and agent_transcript_path - both REQUIRED fields on every SubagentStop payload that the current observer ignores, and the single omission behind the duplicate firings, the fourfold overcount, and the mis-attribution making all 16,025 existing rows describe the parent rather than the subagent. model and effort are dropped; the payload never carries them.

THREE CONSTRAINTS THE EVIDENCE IMPOSED, which the SPEC must honour. First, the router-plus-side-files pattern is REQUIRED rather than optional: a preloaded SKILL.md is an eager tax on every dispatch of that agent, while side files are never inlined and arrive reachable by an absolute path the preload supplies, so procedures belong on disk behind a small router. Second, skill references must be fully qualified as plugin:skill - bare names fall back to suffix matching that takes the first registry hit and resolves arbitrarily. Third, the name-integrity check is structural rather than a nicety, because an unknown skill name in `skills:` logs a warning and spawns the agent WITHOUT it, which is silent degradation.

ALSO SETTLED, outside the four terms: review loops terminate by closing the reviewer's question rather than by capping rounds; bugs are reproduced before diagnosis and fixes tested for cause rather than effect; Claude in Chrome is the reproduction tool while the re-runnable command plus its inputs is the investigator's return obligation, not a property of the tool; and destructive operations carry no confirmation rule, the deny list being the whole control.

CARRIED AS A NAMED RISK, not a blocker: R13, Lead-band skill-trigger reliability measured at 50-55 percent without a hook backstop and never tested end to end. It narrowed from the whole design to the Lead band only, because the nine executing agents receive skill bodies unconditionally and never choose to invoke. Recommended mitigation, to be decided in the SPEC: give Leads `skills:` preload for load-bearing procedures and reserve Skill-tool invocation for genuinely discretionary ones, routing everything critical around the trigger-reliability question at the cost of the body alone.

CONSEQUENCE OF THIS APPROVAL: the standing constraint barring mutation of any agent, rule, hook or skill file was written as holding "until the target architecture at c3 is approved". It expires here, by its own terms.
