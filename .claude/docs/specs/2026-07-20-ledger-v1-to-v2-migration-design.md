# SPEC — v1 to v2 Ledger Migration (windful-ocean pilot)

- Status: proposed (design LOCKED; awaiting implementation via mitosis)
- Date: 2026-07-20
- Thread: ledger-v1-to-v2-migration
- Supersedes: nothing. Complements the frozen v2 plugin spec (`2026-07-13-continuity-v2-plugin-SPEC.md`) and narrows Plan 07 (`2026-07-13-continuity-v2-07-migration.md`) to a single-store pilot.

---

## 1. Context

The continuity ledger has two implementations in play:

- **v1** — the file-based ledger this repository uses today (`.claude/ledger/` with `PROJECT.md`, `threads/`, `decisions/`, `sessions/`), written by the local `session-handoff` skill and read by the local `resume-project` skill.
- **v2** — the `continuity-ledger` plugin at `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin`: a ULID-addressed store persisted to a git orphan ref (`refs/heads/_ledger`) via a `GitRefDriver`, with an MCP server named `ledger` (`.mcp.json:3`) and its own hand-off/resume skills.

This SPEC covers migrating **only** the windful-ocean v1 ledger into the v2 plugin store, losslessly, as the single pilot that proves the plugin end-to-end before any rollout to the other canonical stores. The migrator is written to be general-purpose (parameterized by ledger root and project key) but is **run only on windful-ocean** in this phase.

The design was reached through a locked brainstorm (four confirmations) plus a ratified migration architecture. This SPEC binds those decisions and corrects the technical assumptions the earlier audit got wrong (Section 4).

## 2. Goals

1. Migrate windful-ocean's v1 ledger into the v2 plugin store with **zero loss** — every piece of v1 content lives inside v2 (or is a conscious, documented ReviewQueue item), proven by a five-layer verification harness before any cutover.
2. Install the `continuity-ledger` plugin globally with its skills renamed so v1 and v2 skills **coexist without collision**.
3. Prove a fresh session can record via the plugin (`/ledgerize`) and resume via the plugin (`/lift-off`) against the migrated store, end-to-end.
4. Keep v1 as a **test-only, read-only rollback** (not a backup) until the plugin is proven by a soak window.
5. Never connect to or through the MCP surface for migration; never push confidential content to the public origin.

## 3. Non-Goals

- Migrating the other four canonical stores. Deferred to a future per-repo rollout, committed as new changes.
- Deleting or rewriting the v1 source. It is archived read-only, reversible, until the plugin is proven.
- Modifying the plugin beyond the two skill renames (Section 4 corrects the earlier "surgical export additions" assumption to **none required**).
- Live-curating PROJECT.md's stable core into per-thread spines. Deferred to a post-cutover curation thread; migration only preserves it verbatim.
- Publishing or maintaining the migrator. It is throwaway, single-run, not shipped as a product surface.
- Any unattended or fully-automated apply. Every apply and every cutover step is a conscious human action.

## 4. Ground-Truth Corrections (verified against plugin source)

The earlier audit made five assumptions that a source read (`codebase-analyst`, 2026-07-20) found wrong. The design binds the corrected facts:

1. **No SessionEvent schema exists.** Session events are unvalidated positional args (`threadId, isoTs, actor, markdown`) — the tool boundary checks only non-empty strings (`src/tools/append-session-event.mjs:19-27`), the driver boundary only `isUlid(threadId)` + `typeof markdown === 'string'` (`src/drivers/local-driver.mjs:155-168`). The event body is genuinely free-form markdown with no envelope and no `type`/`kind` field. **Consequence:** the provenance-snapshot mechanism (Section 6.3) is schema-legal.
2. **No surgical export additions are required.** Every primitive a driver-level migrator needs is already exported: `LocalDriver`/`GitRefDriver` with public `writeThread`/`writeBinding`/`appendSessionEvent`/`writeDecision`/`commit`/`sync`/`init`/`root`; `validateThread`/`assertValidThread`/`validateBinding` (`src/schema/index.mjs:1-10`); `projectKey` (`src/util/project-key.mjs:3`); `newUlid` (`src/util/ulid.mjs:5`); `assertSpineCaps` (`src/model/index.mjs:9-14`); `rebuildIndex`; and the shared orphan-root constants `EMPTY_TREE_SHA`/`LEDGER_ROOT_MESSAGE`/`LEDGER_INIT_IDENTITY`/`mintLedgerRoot` (`src/drivers/git-ledger.mjs:1-65`). A migrator deep-imports `src/*.mjs` with **zero source changes** to the plugin.
3. **Git push is NOT automatic.** `commit()` writes only to the local worktree and updates the local ledger ref (`git-ref-driver.mjs:236-251`); push happens only inside `sync()` (`:253-289`), itself reachable only via the explicit `ledger-cli sync` subcommand (`bin/ledger-cli.mjs:36-39`). No tool, hook, or MCP path calls `.sync()`. **Origin is hardcoded** to `origin` via `DEFAULT_REMOTE` (`git-ledger.mjs:12`); no user-config knob exposes it. **Consequence:** the leak gate is a pre-`sync` gate, not a per-write gate — the migrated store sits local-only until a deliberate `sync`.
4. **`writeThread` does NOT enforce spine caps.** Only AJV schema validation runs on write (`local-driver.mjs:66`); `assertSpineCaps` (`src/model/caps.mjs`) is exported but never called by the driver. **Consequence:** the migrator must call `assertSpineCaps` on every emitted thread itself and demote over-cap spine content into the provenance snapshot (Section 6.3), keeping the emitted spine within caps.
5. **`CLAUDE_PLUGIN_DATA` throws if unset** — read in `src/drivers/select.mjs:24-30` (not `project-key.mjs`, which is a pure path-sanitizer). The runtime store root is `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger-worktree` for a git repo. **Consequence:** the store-root-mismatch risk is real; a live plugin round-trip (V-live, Section 7) must confirm the plugin resolves exactly the store the migrator built.

The one assumption that held: **v2 Thread natively carries `completion_criteria` and `closure_statement`** (`src/schema/thread.schema.mjs:15,20,33-44,61`). The Thread schema is `additionalProperties:false` with 14 required fields; `priority` and PROJECT.md stable-core have **no** native home and are orphan fields.

## 5. Locked Design Decisions (binding)

Grounded in the decision records under `.claude/ledger/decisions/`:

1. **Orphan v1 fields ride a per-thread provenance Snapshot session event.** Fields with no native v2 home (`priority`, non-spine sections, over-cap spine detail) are embedded verbatim, with a `sha256` of the source, inside a per-thread snapshot event — nothing is lost inside v2 itself. (`2026-07-20-migration-design-confirmed-leak-scrub.md`, `2026-07-20-migration-lossless-into-v2-and-write-path.md`.)
2. **PROJECT.md folds verbatim into a snapshot; live-curation deferred.** The v2 store has no PROJECT.md file type, so the 80-line cap is obviated. Verbatim preservation now; relocation of Goal/Constraints into spines or a future project record is a post-cutover thread. (`2026-07-20-migration-design-confirmed-leak-scrub.md`.)
3. **Hard cutover + gated soak; dual-write/shadow rejected.** After migration the human begins recording/resuming through the plugin for windful-ocean; v1 becomes read-only rollback. "Proven" requires **>=5 sessions AND >=14 days** of successful v2 operation. Dual-write was rejected as structurally unsound (v1 slug/path links vs v2 ULID-only links cannot be kept consistent). (`2026-07-20-migration-design-confirmed-leak-scrub.md`.)
4. **Leak-gate resolved by scrubbing foreign references at source, not tokenizing.** The source scrub is **already executed and verified** this thread (graphify-out payloads deleted, one codename-bearing decision file renamed, five foreign tokens removed across 36 files, grep-confirmed zero remaining). Leak-safety is generalized as a mandatory foreign-token scan that gates every migration run and every pre-`sync` push. (`2026-07-20-migration-design-confirmed-leak-scrub.md`.)
5. **windful-ocean first; global install; skills renamed for coexistence.** Install the plugin globally; rename the plugin's skills `session-handoff -> ledgerize` and `resume-project -> lift-off`. The local v1 `session-handoff`/`resume-project` keep their names and keep working. Reverses the earlier "windful-ocean last." (`2026-07-20-migration-windful-ocean-first-plugin-install-coexistence.md`.)
6. **Lossless INTO v2 via a driver-level bulk build.** The v1 archive is a test-only rollback, never the preservation backing. Write path = hand-assemble AJV-valid Thread/Binding records and call `assertValidThread` + `driver.writeThread` directly (bypassing `newThread()`/MCP tools, which force `status:active` + `now()` — `src/model/thread.mjs:5,44,50`), preserving historical status and timestamps; decisions rendered markdown; sessions byte-copied. The MCP tool-handler write path is rejected (it corrupts historical state). (`2026-07-20-migration-lossless-into-v2-and-write-path.md`, `2026-07-13-adopt-ledger-migration-architecture.md`.)
7. **CLI-only, human-run, idempotent, resumable.** A `ledger-cli migrate` subcommand (never an MCP tool). Idempotency = committed identity manifests (real ULIDs minted once, timestamp-seeded); a re-run resolves every id through the manifest before minting (Flyway "already applied" pattern). v1 read-only (expand-contract). (`2026-07-13-adopt-ledger-migration-architecture.md`.)
8. **Eight open items ratified; frozen contract wins every conflict.** `schema_version = 1` top-level (the architecture report's `2` is a defect that fails the live validator); only Thread and BranchBinding are AJV-validated; migrated session actor is a free string; `external_refs[].system = "file"`; unresolvable `Thread: -` decisions and stray artifacts route to ReviewQueue held, never fabricated, never dropped (pointers-not-payloads). (`2026-07-13-ratify-migration-open-items.md`.)

## 6. Architecture

### 6.1 Transform DAG (N0–N19, driven from the CLI)

The migrator is a read-only-source transform DAG. For the windful-ocean pilot (a single git store) the full DAG runs, with the multi-store batch driver (`--all`, `STORE_GROUP_ORDER`) unused.

| Node | Responsibility |
|---|---|
| N0 | Pre-flight: quiescence gate, source SHA-256 baseline, inventory hash, pre-apply tarball snapshot |
| N1 | Inventory: detect the v1 store; exclude `graphify-out`/`node_modules`/`.git` at any depth and packaged skills examples |
| N2 | Dedup: elect canonical store; subset-verify any worktree copies (subset -> SKIP, any only-in-copy record -> HALT; never union) |
| N3 | Preconditions: per-store safety gate; compact/checkpoint sentinel -> HALT; `status:active` threads catalogued as zombies (demoted at emit, never blocking) |
| N4 | Parse: thread (both generations), decision (all header generations), PROJECT.md, session census; unresolvable fields -> `null`/empty for ReviewQueue |
| N5 | created_at derivation ladder (rung recorded per record) |
| N6/N7 | Identity: mint ULIDs (monotonic, seeded by derived created_at ms) + decision NNNN; ThreadMap/DecisionMap |
| N8/N9 | Cross-reference reverse index + 15-surface rewrite plan (slug/path -> ULID/NNNN) |
| N10-N15 | Emit threads, decisions, sessions, bindings, zombie demotions, PROJECT.md into an in-memory `MigrationOutput` |
| N16/N18 | Materialize: orphan-branch build via git plumbing on the shared deterministic root, then `rebuildIndex` |
| N17 | Verify: V1-V5 harness + foreign-token scan (Section 7) |
| N19 | ReviewQueue roll-up + human-readable migration report; open MANUAL/HALT entries block apply |

**Provenance-snapshot and PROJECT.md-fold emit (Section 6.3) extend N10-N15.** The foreign-token scan (Section 7, "V-scan") extends N17.

### 6.2 created_at derivation ladder

Per thread, first rung that resolves wins; the rung is stored on the ThreadMap entry:

1. git first-commit date of the thread file
2. earliest session date for the thread
3. earliest decision date referencing the thread
4. the thread's `updated:` field

### 6.3 Provenance snapshot and PROJECT.md fold

- **Per-thread provenance snapshot.** For each migrated thread the migrator appends one session event (`actor = "migration-v1"`) whose body embeds the verbatim v1 thread markdown plus every orphan field (`priority`, non-spine sections, any over-cap spine detail demoted here to keep the emitted spine within `assertSpineCaps`), and a `Source-SHA256:` line over the source bytes. Legal because session bodies are unvalidated free-form markdown (Section 4.1).
- **PROJECT.md fold.** PROJECT.md is folded verbatim (plus its `sha256`) into a single project-provenance snapshot event attached to the **anchor thread** — defined deterministically as the thread with the earliest derived `created_at`. A ReviewQueue MANUAL entry records the fold so the human can relocate Goal/Constraints during the post-cutover curation thread. Deterministic anchor selection keeps re-runs idempotent.
- **Zombie demotion note (N14).** A `status:active` thread found at migration is demoted to `paused`, documented by a session event with `actor = "migrated"` (the ratified value from open-item (d)). The two actor strings (`migration-v1` for provenance, `migrated` for demotion) plus distinct ISO timestamps guarantee unique event filenames.

### 6.4 Write path and materialization

- Hand-assemble each Thread as a raw object satisfying all 14 required schema fields (`thread.schema.mjs:7-24`); run `assertValidThread` then `assertSpineCaps`; then `driver.writeThread(record)` — terminal status and historical timestamps preserved.
- Decisions rendered to markdown (structural check: frontmatter present + `Thread-Id` resolves). Sessions byte-copied (SHA-256 equality only). Bindings validated by `validateBinding` (a migrated binding carries no `schema_version`).
- Materialize the orphan ref by git plumbing (`hash-object -w` -> temp-index `write-tree` -> `commit-tree -p <root>` -> `update-ref refs/heads/_ledger`) parented on the SAME deterministic root the driver mints (`mintLedgerRoot` / `EMPTY_TREE_SHA` under `LEDGER_INIT_IDENTITY`). Because the root SHA is byte-identical, the driver's `init()` adopts the pre-seeded ref (`#ensureLedgerRef` first branch) and never re-mints. Every migration commit carries an `Op-Id: <ulid>` trailer.
- Identity manifests live under `_migration/` in the target, committed: `thread-map.json`, `decision-map.json`, `session-map.json`, `review-queue.json`, and the dry-run `plan.json`. They are the idempotency spine.

### 6.5 CLI verbs

- `migrate` (dry-run default): reads source read-only, writes `plan.json` + a human report, mutates no target.
- `migrate --apply`: refuses with `blocked:true` while any MANUAL/HALT/open ReviewQueue entry remains; else re-hashes source (V5), writes the pre-apply tarball snapshot to a reported path, materializes, re-verifies V1-V4 with V4 a real cold `get_resume_brief`, runs the foreign-token scan, writes the report, leaves the target in place.
- `migrate --plan <file>`: drives apply from a locked committed plan's identity maps (resolve-before-mint).
- `migrate --verify-only`: replays V1-V4 over a plan, exits without committing.
- `migrate --resume`: loads committed `_migration/*` maps so minting resolves-before-mints.
- `migrate --rollback` (pre-cutover): deletes only the target (`git update-ref -d refs/heads/_ledger`); source untouched.
- `restore <target>`: rebuilds a working store from the committed ledger ref (disaster-recovery companion; never reads a v1 store).

## 7. Verification and Acceptance

### Five-layer harness (`src/migrate/verify.mjs`, N17)

- **V1 — counts.** `verifyCounts`: thread/decision/session/binding count parity, baseline vs output.
- **V2 — bytes + facts.** `verifyBytes`: SHA-256 byte-equality for sessions; line-level source-fact preservation for reserialized threads/decisions (every non-empty source line appears in the rendered text).
- **V3 — structural.** `verifyStructural`: every thread/binding passes the frozen validators (so `schema_version === 1` is intrinsic); every status is one of the five legal states; every cross-ref `status:'resolved'`; `index.resumable` equals the resumable-status thread count.
- **V4 — cold read.** `verifyColdRead`: a cold `get_resume_brief` returns the persisted `active_goal`/`next_step` (consumer injected as `resumeBriefFn`, no live MCP in the harness).
- **V5 — source integrity.** `verifySourceHash`: apply-time re-hash of the untouched source detects any drift or missing file.

### Added gates (this pilot)

- **V-scan (leak gate).** A foreign-token scan over the emitted tree and all provenance snapshots must be green before apply and before any `ledger-cli sync`. Belt-and-suspenders over the completed source scrub; generalized as a reusable redaction-dictionary parameter.
- **V-live (store-root round-trip).** After apply, confirm the running plugin (with its runtime `CLAUDE_PLUGIN_DATA`) resolves exactly the migrated store: a live `/lift-off` presents the migrated threads and a live `/ledgerize` writes a new session into the same store. Closes the store-root-mismatch risk (Section 4.5).

### Thread completion criteria (from the ledger thread)

1. Migration brainstormed + designed + planned; SPEC written + user-approved.
2. Plugin installed globally; skills renamed `ledgerize`/`lift-off`; v1 skills verified coexisting un-obstructed; `core.hooksPath` conflict reconciled.
3. Throwaway driver-level migrator implemented (deep-imports plugin primitives, parses v1, emits schema-valid v2, lossless into v2) and passes the five-layer harness on windful-ocean.
4. windful-ocean v1 ledger migrated to v2 and validated; a fresh session records via `/ledgerize` and resumes via `/lift-off` end-to-end.
5. v1 retained as test-only rollback (not a backup), reversible until the plugin is proven; other four stores deferred.

## 8. Workstreams and Sequencing

The work splits into **buildable code** (implemented by mitosis) and an **operational runbook** (human-run, gated, after the code ships). The code spans two locations: the plugin repo and `~/.claude` config.

### A. Plugin preparation (plugin repo + ~/.claude) — must precede install

- A1. Rename plugin skills `session-handoff -> ledgerize`, `resume-project -> lift-off`: `name:` frontmatter (`skills/*/SKILL.md:2`), any invocation strings in `description:`, and the 12-step checklists. The collision is real today — both plugin and local v1 skills are byte-identical `name: session-handoff`/`name: resume-project`, and `~/.claude/skills` symlinks into this repo.
- A2. Update `~/.claude/rules/common/continuity-ledger.md` in lockstep (it names both skills). This file is under `~/.claude` (not git; the `protect-claude-config.sh` PreToolUse hook returns "ask" — human approves).

### B. Migrator implementation (plugin repo) — the core code build

- The 14-task TDD build from Plan 07, narrowed to the single-store pilot: net-new manifest/plan schemas; inventory; dedup + preconditions; parsers; created_at ladder; identity minting; cross-ref rewrite; emit (extended with provenance snapshots + PROJECT.md fold + zombie demotion); materialize (orphan plumbing + `rebuildIndex`); the V1-V5 harness + V-scan; ReviewQueue + report; pipeline (`migrate`/`--apply`/`--plan`/`--verify-only`/`--resume`/`--rollback`); `restore`; and an end-to-end pilot migrate + restore round-trip test.
- Three runtime deps only (`@modelcontextprotocol/sdk`, `ulid` 3.0.2, `ajv` 8.20.0), pinned exact; SHA-256/git-plumbing/tarball via Node built-ins + system binaries. Node >= 20 ESM, `node --test`, no build step, no code comments, no emojis.

### C. Plugin install + coexistence verification (human-gated) — operational

- C1. Install the plugin globally. Enabling it writes `enabledPlugins` into the **tracked** `.claude/settings.json` (via the `~/.claude/settings.json` symlink) — review the diff; the enabled source is the github source, not a local path.
- C2. Verify coexistence: local v1 `session-handoff`/`resume-project` and plugin `ledgerize`/`lift-off` both resolve with no name collision.
- C3. Reconcile `core.hooksPath`: accept the plugin's built-in chaining (installer saves the prior path to `continuity.priorHooksPath` at `hooks/lib/installer.mjs:91`; the dispatcher execs the prior hook of the same name). Verify windful-ocean's `.githooks/pre-commit` still runs; confirm the plugin's `commit-msg` (trailer) hook behavior against any existing commit-msg hook.
- C4. Confirm `CLAUDE_PLUGIN_DATA` is injected at runtime and resolves the expected project-key store root.

### D. Migrate windful-ocean (human-gated) — operational

- D1. `ledger-cli migrate` dry-run -> read the report + ReviewQueue.
- D2. Resolve every MANUAL/HALT entry (including the PROJECT.md-fold relocation note held for post-cutover).
- D3. `ledger-cli migrate --apply` -> V1-V5 + V-scan green -> orphan ref built. Pre-apply tarball snapshot retained.
- D4. V-live round-trip: live `/lift-off` presents migrated threads; live `/ledgerize` writes into the same store.

### E. Cutover + soak (human-run) — operational, mostly out of this SPEC's build scope

- E1. Begin recording/resuming windful-ocean through the plugin; archive v1 read-only.
- E2. Soak: >=5 sessions AND >=14 days. Decommission (retire v1 hooks, delete the archive) is a separate post-soak checklist, not part of this SPEC.

**Ordering:** A -> C -> B may proceed in parallel with A/C (the migrator code does not depend on the install), but B's E2E and all of D depend on B complete and C done. D depends on A, B, C. E depends on D.

**Mitosis scope:** workstreams A and B are the buildable code mitosis implements (in the plugin repo and `~/.claude`). Workstreams C, D, E are a human-run operational runbook executed after the code ships; they are defined here but are not code MSPs.

## 9. Risks and Mitigations

- **Store-root mismatch (`CLAUDE_PLUGIN_DATA`).** A runtime data root different from where the migrator built the worktree silently orphans the migrated store. Mitigation: V-live round-trip (Section 7); C4 confirms injection before D.
- **Skill collision.** Installing without the rename yields two skills named `session-handoff`/`resume-project`. Mitigation: A1 renames before C1 (install); C2 verifies.
- **Historical/terminal threads bypass `open_thread`.** Mitigation: direct `writeThread` with hand-assembled records (Section 6.4); AJV still enforced; `assertSpineCaps` called explicitly; over-cap detail demoted to the snapshot.
- **Leak to public origin.** v2 `sync` pushes `refs/heads/_ledger` to `origin` (hardcoded). Mitigation: source scrub done; V-scan gates apply and pre-`sync`; push is manual and never triggered by the migrator.
- **hooksPath / commit-msg reconciliation.** The plugin owns `commit-msg` (trailer). Mitigation: C3 verifies chaining preserves `.githooks/pre-commit` and that commit-msg behavior is intended.
- **Idempotency drift.** Mitigation: committed `_migration/*` manifests; resolve-before-mint on every re-run; `--resume`/`--plan` drive from locked maps.

## 10. Rollback

Reversibility is structural, not scripted. Pre-cutover, `migrate --rollback` deletes only the target ref (`git update-ref -d refs/heads/_ledger`); the v1 source was never written. Post-cutover but pre-decommission, the archived read-only v1 store plus the retained pre-apply tarball snapshot allow a full return to v1 skills until the soak proves the plugin.

## 11. References

- Decisions: `.claude/ledger/decisions/2026-07-20-migration-design-confirmed-leak-scrub.md`, `2026-07-20-migration-windful-ocean-first-plugin-install-coexistence.md`, `2026-07-20-migration-lossless-into-v2-and-write-path.md`, `2026-07-13-adopt-ledger-migration-architecture.md`, `2026-07-13-ratify-migration-open-items.md`.
- Frozen v2 spec: `.claude/docs/superpowers/specs/2026-07-13-continuity-v2-plugin-SPEC.md`.
- Implementation-level plan basis: `.claude/docs/superpowers/plans/2026-07-13-continuity-v2-07-migration.md` (Plan 07 — transform DAG, five-layer harness, 14 TDD tasks; narrowed here to a single-store pilot).
- Plugin source: `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin` (`src/schema/thread.schema.mjs`, `src/drivers/{local-driver,git-ref-driver,select,git-ledger}.mjs`, `src/schema/index.mjs`, `src/util/{project-key,ulid}.mjs`, `hooks/lib/installer.mjs`, `.mcp.json`, `skills/{session-handoff,resume-project}/SKILL.md`).
