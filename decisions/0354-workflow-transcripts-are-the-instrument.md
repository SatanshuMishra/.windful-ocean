---
Status: accepted
Date: 2026-08-11T23:53:37.398Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0354. Source B is the instrument, it counts four token classes, and attribution is the real gap

## Context

SPEC B section 8 names the instrument's source the single largest open question, because budget's runtime presence was never probed and whether transcript records carry input-token usage was unverified. Both were answerable 2026-08-11 from artifacts already on disk, with no probe run. Workflow runs persist <session>/subagents/workflows/wf_<runId>/ holding agent-<id>.jsonl with message.usage per assistant turn (input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens) plus message.model and ISO timestamps; agent-<id>.meta.json with agentType and spawnDepth; and journal.jsonl with started/result rows per agentId keyed by a v2 content hash of prompt and opts. One measured agent: 76 assistant messages, input 10,244, cache_creation 268,854, cache_read 5,467,420, output 20,734 on claude-opus-5 over 11m45s.

## Options

- Source B, the persisted workflow transcripts, as the instrument - chosen
- Source A, the in-sandbox budget global, as the instrument
- Build an external meter around the engine

## Outcome

Source B is the instrument and the question is closed by evidence rather than by a probe. Two amendments the evidence forces on section 2.1. First, tokens are counted in FOUR classes, not the two the SPEC specifies: cache_read alone was roughly twenty times raw input plus cache-creation combined in the measured sample, so a two-number instrument would understate input cost by more than an order of magnitude. Second, availability was never the gap - ATTRIBUTION is: nothing on disk maps an agentId to a label or a phase, so the engine must emit its own label-to-agentId map, or attribution must be reconstructed from the journal key and the prompt text in the transcript's first user record. budget drops to an optional cheap in-run signal; its runtime presence remains unmeasured and is no longer blocking anything.
