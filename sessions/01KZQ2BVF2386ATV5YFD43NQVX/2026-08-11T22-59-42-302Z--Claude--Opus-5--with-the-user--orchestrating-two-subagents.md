Session goal: complete c1's entry path — read T3, resolve the T1-vs-T2 tenfold gap, re-derive c1's figures cold.

SHIPPED — the tenfold gap is resolved, and the answer inverts the working assumption.

T1 and T2 billed $0.0783058 and $0.0074818 for the identical 70,368-token cache read. Both costUSD values reconstruct to 7 decimal places under Haiku 4.5 rates ($1.00 input / $5.00 output / $0.10 cache read / $2.00 cache write 1h per MTok), so the arithmetic is not in doubt; only the cause was.

First reading (MINE, WRONG, recorded so it is not re-derived): the SDK folded the 70,368 cache-read tokens into modelUsage.inputTokens and priced them a second time at the full input rate, making T1 an accounting artifact worth ~$0.0075. That is refuted. The aggregator and the price function keep input_tokens and cache_read_input_tokens strictly separate; there is no double-count.

Actual cause: T1 issued TWO API requests, T2 one. The second is automatic session-title generation, and it re-sends the entire 249,693-char first user message UNCACHED at full input price.
  main turn  : input 10, cache_read 70,368, output 92  -> $0.0075068
  title call : input 70,739 (70,368 body re-sent cold + 371 wrapper), output 12 -> $0.0707990
  title = 90.4% of the turn's billed cost.
The 70,368 appearing on both sides is the tell: same body, tokenized identically, sent twice. The 371 residual is the <session> wrapper plus title system prompt, which my artifact theory left unexplained.

Trigger guard: the title call is skipped when restored history contains any non-system message. Resume therefore never pays it; a fresh session always does.

Evidence: bun-compiled SDK binary, harness's own node_modules copy, byte-identical (sha256 43484b13...) to the installed one, so it is the exact engine that produced these rows. Aggregator and price function located and read. Corroborated by an `ai-title` transcript entry ("Acknowledge bulk data block") present on T1 and absent on T2, matching the +12 output exactly.
HONEST LIMIT: only one requestId per turn is transcribed, so the title request's usage is solved arithmetically, not observed. It is over-determined — the modelUsage field sums and the independent costUSD sum give the same unique solution, and the code path and ai-title artifact agree — but it is a derivation, not a measurement.
UNVERIFIED: CLAUDE_CODE_DISABLE_TERMINAL_TITLE feeds the same guard and appears to disable the call. Read off the guard expression only; never executed.

Consequence for the SPEC: this is a real per-spawn charge, not a figure to discount. Any host that spawns a fresh session per MSP or per subagent pays it once per spawn, scaled to that spawn's first prompt, and it is invisible in the turn's own API usage block. It is an argument for resume-based session reuse that is independent of context-fill, and it bears directly on the decomposition and rotation questions this thread holds open. It compounds with the content-keyed prefix cache: T1's main turn read WARM from an earlier run's entry while the title still paid COLD, so a warm main turn does not buy a warm title.

RISK NOW RESOLVED: the standing risk "Resolve the tenfold gap between two identical cache reads before quoting any cache-read price" is discharged by the above. If it survives in another scope, this entry is the receipt — do not redo it.

CORRECTED: the prior briefing read as though T3 had already fired. It had not. The 17:07:24 MDT timestamp is a future deadline, not a past event.

FAILED — the SPEC B citation census produced nothing.
A codebase-analyst was dispatched to run the closed census (the *_SCHEMA count, the 48-vs-50 phase-literal discrepancy, the four mitosis.js line citations, supervisor.mjs escalate->parked, the prompt-byte figures). A Claude Code process exited mid-run and killed it. Read-only agent, no worktree, no artifacts on disk, in-process state lost; only a 207-line JSONL transcript remains.
Deliberately NOT salvaged: c1 demands a closed census, so a partial one does not satisfy the criterion, and reading the transcript would have cost the context that caused the loss. It needs a clean re-run with a full context window, not a resume.

FAILED — the T3 watcher.
A Monitor was armed on q11-results.jsonl covering the success path and both failure paths (driver death, driver-done-without-row). It was stopped along with the subagents at the user's instruction. The row will land with nothing listening. (I also told the user the watcher was armed at a point when it was not; corrected in-session and armed immediately after.)

STILL RUNNING AFTER THIS SESSION — read this before anything else next time.
Detached driver, PID 99761, ppid=1. It survived both the Claude Code process exit and the subagent stop. It fires turn T3-EXPIRY-RESUME at 2026-08-11T23:07:24Z (17:07:24 MDT 2026-08-11) and appends the row to q11-results.jsonl. On a non-zero exit it sleeps 180s and retries once as T3-EXPIRY-RESUME-RETRY.
  script : artifacts/2026-08-11-sdk-probe-harness/q11-driver.sh (arg 4500)
  log    : artifacts/2026-08-11-sdk-probe-harness/q11-driver.log
  results: artifacts/2026-08-11-sdk-probe-harness/q11-results.jsonl (2 rows at session end: T1-CREATE, T2-CONTROL-RESUME)
  kill   : kill 99761
When reading the T3 row: read cache_read_input_tokens together with cacheWindowLapsed, or a warm read looks like an expiry price — and read totalCostUsd, NOT the usage block, or the title request is invisible.

No SPEC text was written. No code was changed. c1 remains in progress.
Memory written: fresh-sdk-session-pays-for-first-prompt-twice (~/.claude/projects/.../memory/), indexed in MEMORY.md.