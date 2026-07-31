P2 UNBLOCKED. All five defects of 0166 fixed in four atomic commits on fix/m2-monotone-status, each landing its twin edit in both copies in one commit. Nothing pushed, no PR, main still 1bb149d.

SHIPPED, in order on top of 9e36674:
- dcb1a46 fix(mitosis): tell the truth about what the condemned veto does — D1+D2. vetoLogLine now renders a per-veto effect clause; CONDEMNED reads "the unit is reset to parked and rebuilds from plan", PARKED keeps "the derived status is unchanged" byte-unchanged because it is true there. Call site (now mitosis.js:3889) passes the VETO_CONDEMNED constant directly, removing the fabricated three-literal derivation and making the unwrapped vetoLogLine throw unreachable. Both frontier-train-e2e assertions from 6b11f25 updated in the same commit; the H4 resurrection-guard parked assertion confirmed unmodified by reading it.
- b7b54b0 fix(mitosis): let only a populated built-unit fact withhold a ref — D3, ruled and recorded as 0167. Receipted RED at dcb1a46 with two failing assertions.
- 5684271 test(mitosis): give the surviving status-fold assertions one policed home — D4, ruled and recorded as 0168. Test files only.
- ef92657 fix(mitosis): keep the status fold total when its log sink throws — D5, option chosen and recorded as 0169. Receipted RED at 5684271 with the throw escaping foldObservedStatus from inside Array.reduce.

VERIFIED BY THE ORCHESTRATOR, not taken on report: npm test => tests 1813, pass 1813, fail 0, skipped 0, todo 0, exit 0. The count reconciles exactly against the 1820 baseline at 9e36674: minus the 8 duplicated transcription assertions D4 removed, plus D5's one new test. mirror-guard passes for both status-facts.mjs and parking.mjs (both WHOLE class), which is the twin-parity gate.

ACCEPTED BEYOND SPEC, checked directly rather than trusted: D1 derived ADVANCE_VETOES from a frozen VETO_EFFECTS record instead of the literal array, so a veto cannot be named without stating its effect. Read status-facts.mjs:4-23 to confirm Object.keys preserves insertion order (parked, condemned), ADVANCE_VETOES.length is still 2, the throw is unsoftened, and advanceVeto is untouched. Sound; kept.

WHAT WENT WRONG:
- My own suite invocation was wrong. `node --test .claude/lib/superpowers-parallel/tests/` fails MODULE_NOT_FOUND on node v26.4.0 — it resolves the directory as a module and reports a bogus 1 test / 1 fail. The project's runner is `npm test` (package.json:7), which globs three test directories. Cost one cycle; no code impact.
- A subagent reported D4's suite as "1813 tests / 1812 pass, 0 fail", which does not reconcile. The independent re-run above showed 1813/1813/0. A reporting slip, not a real failure — but it is the fifth time this thread that a returned number needed checking, so the habit of re-running the receipt myself stays.

NOT DONE, deliberately, and the reason: steps 2-5 of the prior next_step (coverage entries, upstream unset, push, PRs, then A7) were left untouched at 86% context rather than started and abandoned half-written. A PR's scope is frozen at creation, so opening one on a rushed coverage entry is unrecoverable.