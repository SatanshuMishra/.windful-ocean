---
Status: accepted
Date: 2026-08-11T21:33:25.979Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0348. 0325's accepted cost is retracted: the SDK host keeps native resume, fork, rewind and a fill sensor

## Context

0325 accepted as a cost that moving orchestration to an Agent SDK host "loses the /workflows progress UI and harness-native resume, which the supervisor must now provide itself". That clause was decided from documentation, never from running the SDK. A 2026-08-11 empirical probe measured the contract directly: @anthropic-ai/claude-agent-sdk 0.3.228 against claude 2.1.228, all probes pinned to claude-haiku-4-5-20251001, ~$0.42, 24 raw records. The SDK was not previously installed on this machine. Measured: cross-process resume works and KEEPS THE SAME session id - a separate OS process recovered an unguessable codeword and the transcript grew 8,709 to 13,918 bytes in place with no new file. Resume is NOT cwd-keyed: resuming from a different cwd succeeded and the transcript stayed in the originating directory. The store is SHARED WITH THE CLI - `claude -p --resume <sdk-created-id>` exited 0 and returned the codeword. forkSession gives real isolation (parent knows one codeword, fork knows two). resumeSessionAt truncates context while preserving the file on disk. Query.getContextUsage() is a direct fill sensor whose totalTokens equalled the usage-derived sum exactly across three successive turns (76,643 / 82,829 / 89,025 against maxTokens 200,000). Artifact: artifacts/2026-08-11-agent-sdk-session-resume-probe.md.

## Options

- Retract the cost clause and build on the shipped primitives - chosen
- Leave 0325 intact and build supervisor-side resume anyway
- Re-probe before acting on the result

## Outcome

0325's accepted-cost clause is RETRACTED as factually wrong; it was wrong in the favorable direction. 0325's OUTCOME - orchestration moves to a Node process hosting the Agent SDK - stands unchanged and is strengthened. The supervisor no longer budgets to build resume, forking, rewind, or a fill sensor; all four ship and were measured working. 0325 fact 2 (only an SDK host can see context fill) is confirmed and strengthened: the host gets a direct sensor, better than deriving fill from ResultMessage.usage. Two constraints the supervisor MUST now honor, both measured. First, the system prompt is NOT persisted with a session - resume replaces it per invocation, so it must be re-supplied on every rotation or the orchestrator's instructions silently vanish; equally this makes the system prompt the natural carrier for 0342's Tier 1 verbatim re-injection. Second, getContextUsage() is reachable only while the query is open - single-shot mode throws "Query closed before response received" - so the orchestrator must run in streaming-input mode. Unpriced and carried as the top open risk: the cost of a resume AFTER prompt-cache expiry, since the probe's resumed turn ran inside the ephemeral_1h window and billed 70,368 tokens as cache_read at $0.0074 rather than the $0.2120 they cost to create.
