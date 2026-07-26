Session opened by resuming ledger-v2-archive-and-seed, verified all five of its criteria were done:true in the stored thread JSON, closed it, and opened THIS successor for the guard work. User instruction was "Go. Think hard." No code was written this session and nothing was merged, published, or installed. Both repos left byte-clean.

WHAT SHIPPED
- Predecessor ledger-v2-archive-and-seed transitioned done with a closure statement (DoD gate passed on stored state, not on assertion).
- This thread created with five immutable criteria, spine seeded, and four decision records written at decision time: 0013 (close predecessor / open successor), 0014 (the corpora never existed), 0015 (adopt over-catch-to-ask, never under-catch), 0016 (status-quo-is-safer partially refuted).
- G0 reproduce-first gate CLEARED. A 159-case harness classified every command through BOTH guard versions.

TWO INHERITED BELIEFS PROVEN WRONG - the main value of this session
1. The "12 verified evasions" and "41-command read-only corpus" DO NOT EXIST as artifacts anywhere in continuity-ledger-plugin. They were planning targets that hardened into apparent fact across sessions. The only guard test file is test/unit/hooks/pre-tool-use.test.mjs (23 blocks, 51 asserts, not table-driven). Criterion 2 of THIS thread was authored assuming they were real; it is now read as coverage floors. See 0014.
2. "Status quo is safer, the tip would net-weaken protection" is only half right. Measured: OLD 0fe1c02 has about 19 read-only false positives and 10 evasions of its own; TIP 5f04dd4 has ZERO false positives but about 21-23 evasions. The inherited 20-command figure conflated genuine regressions with over-blocks the tip CORRECTLY relaxed. Neither guard dominates. See 0016.

ALSO ESTABLISHED
- Branch tip 5f04dd4 is one commit past the b0e1079 that decisions 0008 and 0011 actually evaluated, and shell-tokens.mjs did not exist at b0e1079 - it was created in 5f04dd4. Those decisions were formed against a materially different guard.
- Live install confirmed as 0fe1c02 on main in the marketplace clone, with no shell-tokens.mjs.
- Existing suite is 513 pass / 0 fail WHILE 21+ evasions exist. Green proves nothing here.
- The quadratic in scanSegments is real but NOT a live hazard: slowest measured classification 0.29 ms, steady state 0.02-0.11 ms, zero hangs across 159 cases.
- Prior art found in the frozen v1 archive (analysis/2026-07-21-msp2a-hook-security-findings.md): a sibling guard hit the identical failure mode and the peer-verified fix was an additive union, with the house principle "over-catch to ask, never under-catch". The raw union is disqualified for OUR guard by measurement; a redirect-stripped variant is the fallback shape. See 0015.
- Ten holes predate BOTH guard versions and are new allowlist scope: sh/bash/zsh -c string indirection, find -delete and -exec, git -C targeting the root, xargs from stdin.
- Discovered but OUT of this thread's criteria: three silent allow-paths that are each a bigger hole than the parse gaps - pre-tool-use.mjs:115-116 total bypass when roots resolve empty, hook-io.mjs:50-57 exception swallow, and readHookInput returning {} on malformed stdin. runEntry is shared by every hook in the plugin, so a global fail-closed fix has session-breaking blast radius. This needs a USER SCOPING DECISION before anyone acts on it.

WHAT FAILED / DID NOT HAPPEN
- The solution-architect designing the deny-by-default rule (decisions A-H) did NOT complete. It was redirected mid-run to write its output to .claude/docs/superpowers/specs/2026-07-26-pre-tool-use-guard-deny-by-default-design.md so it would survive the session, but it had not created that file when context hit the wrap threshold. It was stopped cleanly with no partial write. Its last action was beginning to empirically test the evasion classes against the frozen tokenizer. RE-DISPATCH IT next session; all its inputs are durable in 0015, 0016 and the spine, so this is cheap to redo.
- No implementation, no tests written, no scanSegments cap, no review, no merge. Tasks 2 through 5 untouched.

ARTIFACT AT RISK
The 159-case harness lives at scratchpad/guardbench/ (corpus.mjs, run.mjs, report.mjs, refine.mjs, results.json) under the session-scoped temp dir. It will likely be gone next session. Rebuild from 0016 rather than trusting any inherited count.