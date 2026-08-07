# Mitosis Boundary-Gate HALT — Deep-Dive Post-Mortem

Run `wf_93e76203-0f6` (taskId `w2wf0w1rv`) · 2026-07-14 · target repo `continuity-ledger-plugin`
Companion decision record: `.claude/ledger/decisions/2026-07-14-continuity-v2-mitosis-halt-boundary-gate-and-security-flag.md`

## TL;DR
Mitosis re-decomposed the 588-line spec into 15 MSPs, fully IMPLEMENTED the three foundational ones, then HALTED at the per-MSP **diff-scoped boundary lint/type gate** and shipped nothing (`shipped: []`). The gate is hardcoded and unconditional: it runs `npx eslint` + `npx tsc` on BOTH the base and the HEAD side of every MSP and FAILS CLOSED if either side cannot be collected. This plugin is a plain `node --test` ESM repo with NO linter/type toolchain, so the gate could never collect a baseline. The run behaved correctly and safely — no bad merge, no work lost — but the boundary gate is structurally incompatible with a repo that has no eslint/tsc toolchain in its base. This is the crux to explore.

## 1. What was launched
- Vehicle: `Workflow(scriptPath: ~/.claude/workflows/mitosis.js)`, mergePolicy `human-gated`.
- Base at launch: `origin/main` = `a98ecd5` (minimal green scaffold: `package.json` with the 3 exact-pinned RUNTIME deps only, NO devDeps; lockfile; README; trivial smoke test). Prepare stage then pushed `afe02bc` (receipts config + receipts CI workflow + D6 check) — see §8.
- Args: `verify.scopedCheckCmd = "node --test"`, `verify.fullValidationCmd = "npm test"`. NOTE: the project's declared verification contract is `node --test` — it never asked for lint or type checking.

## 2. What happened
- `shipped: []`, `parked: 15`, `overallStatus` = all-parked, no bad merge.
- 3 foundational MSPs parked at `stage: execute` / boundary: `schema`, `foundational`, `runtime-deps-vendoring`.
- 12 downstream MSPs (`model`, `core-driver`, `git-driver`, `drift`, `tool-layer`, `mcp-server`, `control-plane-cli`, `hooks-installer`, `skills`, `plugin-manifests`, `packaging-guard`, `e2e-acceptance`) cascade-blocked ("blocked by a parked prerequisite") at `stage: plan` — they never ran.
- The three foundational MSPs were fully implemented before the gate: their integration branches carry real commits (`feat/foundational-integration` +14, `feat/schema-integration` +13, `feat/runtime-deps-vendoring-integration` +6) plus per-task branches, all living in the worktrees under `.mitosis-worktrees/continuity-ledger-plugin/`.

## 3. The boundary gate: mechanism (code references)
Located in `mitosis.js` inside the per-MSP engine flow (`runEngine` / boundary stage), approx lines 893–935:
- `mitosis.js:893` — `const gateBase = isolation === 'scope-fence' ? launchCommit : fingerprintBase;` (the base side to diff against; `fingerprintBase` defaults to `origin/${baseBranch}`, set at `mitosis.js:2927`).
- `mitosis.js:898` — gate charter: "run the DIFF-SCOPED gate ONCE: block only NEW lint/type errors this MSP introduced, never pre-existing ones. Lint + types only; the full test suite is gated separately at ship (G9)."
- `mitosis.js:900–902` — collect the error list on BOTH sides using the repo's OWN toolchain: `BASE: cd <baseGateWt> && npx eslint . -f json` and `npx tsc --noEmit --pretty false`; `HEAD: cd <validationDir> && npx eslint . -f json` and `npx tsc --noEmit --pretty false`.
- `mitosis.js:903` — the FAIL-CLOSED rule (the decisive line): report `pass=false` if EITHER side cannot be collected cleanly — including **"a missing eslint or tsc config"**, a tool that crashes, output that will not parse into a diagnostic list, a run that scanned ZERO files, or a base-vs-HEAD scope mismatch. An empty eslint array / empty tsc output IS a valid clean result; a COLLECTION FAILURE is not.
- `mitosis.js:905` — identity-count comparison: an error identity blocks iff its HEAD count exceeds its BASE count.
- `mitosis.js:909–923` — the `boundary` agent runs the gate (`BOUNDARY_SCHEMA`), a bounded `boundary-fix` → `boundary-recheck` loop attempts remediation, then `result.boundary` is set.
- `mitosis.js:935` — on non-pass, `result.haltReason = { stage: 'boundary', detail: boundary.output }` → the MSP parks.

The gate is UNCONDITIONAL — there is no arg, config key, or per-repo opt-out. Every MSP passes through it.

## 4. The three failure modes (verbatim engine diagnosis)
The parks are NOT identical; there are two distinct mechanisms:

- **`foundational` — SYMMETRIC toolchain absence.** Diagnosis: *"FAIL CLOSED (pass=false): the DIFF-SCOPED lint/type gate could not be collected cleanly on EITHER side... The repo has no lint/type toolchain, and it is symmetric across base and HEAD (the MSP did not remove a config)."* Neither base nor HEAD has eslint/tsc, so there is nothing to run; the gate cannot produce a diagnostic list, and "cannot collect" is defined as fail-closed even though there are provably zero lint/type errors on both sides.

- **`schema` — ASYMMETRIC, HEAD introduced a toolchain.** Diagnosis: *"This MSP bootstraps the entire lint/type toolchain. BASE (origin/main @ afe02bc) has NO eslint.config.js, NO tsconfig.json, and its package-lock.json pins zero eslint/typescript packages."* The agent added a toolchain to HEAD (see §5), so HEAD collects but BASE cannot → asymmetric → fail-closed.

- **`runtime-deps-vendoring` — ASYMMETRIC, same as schema.** Diagnosis: *"This MSP INTRODUCES the entire lint/type toolchain and its configuration where none existed at base. The base (origin/main = afe02bc = merge-base) has NO eslin[t]..."* → base-side collection cannot be performed → baseline undefined → fail-closed.

## 5. Why HEAD-side self-remediation could not work
Two of the parked MSPs contain a commit literally titled *"fix(...): add project-pinned eslint/tsc toolchain for the diff-scoped gate"* — the agents DETECTED the gate failure and tried to satisfy it by adding eslint/tsc to their own HEAD. This cannot work by construction: the gate diffs HEAD against a BASE side (`origin/main`) that still has no toolchain. Adding a toolchain only to HEAD makes the sides ASYMMETRIC, which the gate also treats as a collection failure (base cannot be collected). No amount of HEAD-side work can supply a baseline that lives on the base branch. The fix must be on the BASE, not in any MSP.

## 6. Root-cause synthesis: the design tension
The boundary gate encodes a strong, deliberate invariant: *never certify "no new lint/type errors" unless you can cleanly collect the error set on BOTH sides* (fail-closed beats fail-open — a hard lesson from the mitosis-resilience work). That invariant is correct for a repo that HAS a lint/type toolchain. But it silently assumes every repo has one. Two legitimate situations violate that assumption and are indistinguishable to the gate from a genuine breakage:
1. A repo that uses NO linter/type-checker at all (verify = tests only) — like this one.
2. The bootstrap MSP that legitimately INTRODUCES the linter where the base had none.
In both, "cannot collect a base baseline" is TRUE but BENIGN (there are provably no pre-existing errors), yet the gate fails closed. The gate cannot tell "no toolchain, so no errors possible" apart from "toolchain present but crashed."

## 7. Is this a mitosis engine gap? — analysis
Arguable yes, and worth a focused decision. Candidate directions (each has a real trade-off against the Three Pillars):
- **(A) Require the toolchain in the base (chosen fix; see §10).** Zero engine change. Cost: every mitosis target must carry eslint+tsc, even projects that don't otherwise use them; couples the repo's toolchain to the engine's gate.
- **(B) Teach the gate that SYMMETRIC absence is a PASS.** If neither side has any eslint/tsc config, there are no lint/type errors to regress → `pass=true` (empty diagnostic set), reserving fail-closed for a toolchain that is present-but-uncollectable or ASYMMETRICALLY removed. This is the most principled fix and unblocks all non-lint repos, but it edits the twin-mirrored fail-closed gate and must be RED-first + dual-reviewed to avoid reintroducing a fail-open. It also does NOT by itself fix the bootstrap-MSP (asymmetric HEAD-add) case.
- **(C) Make the gate configurable / driven by the verify contract.** If `verify` declares no lint/type command, skip the lint/type boundary gate for that run (still gate tests at ship G9). Smallest behavioral surface, but adds a config axis and a way to silence a real guard — needs careful defaults.
- **(D) Let the bootstrap MSP seed the base first.** A dedicated ordering where the toolchain-introducing MSP publishes to the base before any sibling is gated. Complex; effectively (A) done in-run.
Open sub-question: even under (B), the `schema`/`runtime-deps` MSPs added a toolchain reactively; with the gate no longer demanding it, a fresh re-decompose would not add it — so (B) + fresh relaunch might suffice without (A). Untested.

## 8. Related finding: the security flag (SEPARATE decision)
The prepare stage PUSHED `.github/workflows/receipts.yml` to `origin/main` (`afe02bc`). It wires an EXTERNAL, UNPINNED GitHub Action — `uses: shaheershoaib/receipts/enforcer@main` (`receipts.yml:18`) — which runs `npm ci` + the enforcer on every PR. The harness flagged this as untrusted-code integration ("clears only if the user names the external source"). The repo is PRIVATE (limited blast radius). This recurs on EVERY run because it originates from the mitosis receipts TEMPLATE (`~/.claude/…/skills/mitosis/templates/`), not from a one-off — so disposing of it means pinning to a specific commit SHA in the template, replacing the enforcer, or authorizing the source at the template level. Removing the file from the base alone is futile (prepare re-emits it). This is orthogonal to the boundary-gate halt.

## 9. What was NOT lost
- All produced CODE persists as local git commits on the integration + task branches (§2). Nothing deletes them until an explicit `git branch -D`.
- The only remote mutation is `afe02bc` on `origin/main`.
- Re-spent on a fresh relaunch: the orchestration compute (90 agents, ~4.7M tokens of decompose/plan/execute) — NOT the code, unless the branches are deliberately deleted. A salvage path (rebase the existing branches onto the reseeded base + re-run only the boundary gate) is available as an alternative to a clean rebuild.

## 10. The chosen fix (Option A) + its own caveats
Direction (A): seed a clean, REAL, passing eslint(flat)+tsc toolchain into the BASE (`main`) so both gate sides can baseline. Caveats to carry into relaunch:
- The seeded toolchain's STRICTNESS now governs every future MSP's boundary gate. Seed something real (not a no-op ruleset) but clean on the scaffold; revisit strictness deliberately.
- mitosis RE-DECOMPOSES the spec each run, so a fresh run may still spawn a toolchain-touching `runtime-deps-vendoring` MSP. It must be idempotent against the seeded toolchain (re-adding identical config = no strictness change = gate OK). If it tries to LOOSEN or diverge, the gate blocks it — acceptable, but watch it.
- The base is no longer the "minimal seed"; that minimality was itself the root mismatch with this gate.

## 11. Open questions to explore later
1. Is (B) — symmetric-absence-is-PASS — the right permanent engine fix, and does (B)+fresh-relaunch remove the need for (A)? Prototype and test against this exact spec.
2. Should the lint/type boundary gate be GATED on the verify contract (skip when `verify` declares no lint/type command)? What is the safe default?
3. Does the reactive "add toolchain to HEAD" agent behavior indicate the plan/harden prompts should be told the gate's toolchain requirement up front (so they seed the base, not their own HEAD)?
4. Security: adopt a pinned/audited receipts enforcer in the mitosis template — one-time, benefits every future run.
5. Salvage vs rebuild economics for the 15 existing branches on the next run.

## 12. References
- Engine gate: `mitosis.js:893, 898, 900–905, 909–923, 935`; base ref `mitosis.js:2927`.
- Run result: task output `w2wf0w1rv.output` → `result.{shipped,parked}`; journal `…/subagents/workflows/wf_93e76203-0f6/journal.jsonl`.
- Flagged workflow: `continuity-ledger-plugin/.github/workflows/receipts.yml:18`.
- Branches: `git -C continuity-ledger-plugin branch -vv` (afe02bc on main + origin; 15 local integration/task branches).
