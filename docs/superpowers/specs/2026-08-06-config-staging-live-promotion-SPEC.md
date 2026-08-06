# Config staging/live promotion (SPEC A)

Status: designed, not implemented. Authored 2026-08-06.
Governing decisions: 0269 (immutable release subtree plus atomic pointer rename), 0270 (settings.json excluded from releases, reconciled by an ownership manifest).

This SPEC is standalone. It inherits no decision numbers, no step chain, and no citation authority from `~/Downloads/2026-07-30-mitosis-core-rebuild.md`. Every fact below was measured or re-derived on 2026-08-06 against Claude Code 2.1.223 and the repository at `chore/config-drift`.

Goal, in one sentence: give global config a staging/live split whose promotion is a single atomic act and whose sync is enforced by the harness rather than suggested to the model, while `.windful-ocean` stays a tracked public repository.

## 0. Verified ground truth (confirmed live 2026-08-06)

### 0.1 Runtime facts, measured under a sandboxed `CLAUDE_CONFIG_DIR`

Live `~/.claude` was never modified to obtain these. Full method in the ledger session event `2026-08-06T20-05-54-286Z`.

- **M1. A config ROOT can never be immutable.** Claude Code writes `.claude.json`, `backups/`, `projects/`, `sessions/` and `plugins/` into whatever `CLAUDE_CONFIG_DIR` names, observed even on a run that never authenticated. Immutability can apply only to subtrees below the root.
- **M2. A symlinked `settings.json` is followed and written through; the link survives; unrelated keys merge.** Writer exercised: `claude plugin marketplace add`. Scope limit: one writer, not the class.
- **M3. `CLAUDE_CONFIG_DIR` may itself be a symlink, and nested hops traverse.** Two hops measured; the link was not materialized into a real directory.
- **M4. `claude config set` does not exist in 2.1.223.** Any design step that assumes a CLI verb writes `settings.json` must name a different writer.

### 0.2 Live linkage census

`~/.claude` is a real directory holding **37 symlinks into this checkout**: 9 at depth 1 (`CLAUDE.md`, `agents`, `docs`, `keybindings.json`, `lib`, `notes`, `skills`, `sounds`, `workflows`), 26 under `hooks/`, and 2 under `rules/` (`common`, `typescript`). `~/.claude/hooks` and `~/.claude/rules` are real directories, not links.

Consequences today: an edit in this checkout is live at the next tool call in every running session, a `git checkout` swaps global config wholesale, and a half-saved hook breaks every session instantly.

### 0.3 Hook registration form

All 26 registered hook commands in live `settings.json` address hooks as `$HOME/.claude/hooks/<name>` (three of them prefixed `node ` or `python3 `). None hard-codes a checkout path.

This is a load-bearing property: a single entry link `~/.claude/hooks -> current/hooks` preserves every registered path unchanged, and the 26 per-file links collapse to one. No hook registration in `settings.json` changes as part of this work.

### 0.4 The coverage gap — the finding that reshapes migration

A release is built by `git archive`, which carries **only tracked content**. The tracked set does not currently cover the live set. Measured today, tracked files versus files on disk under `.claude/`:

| Entry | Tracked | On disk | Gap |
|---|---|---|---|
| `skills` | 151 | 157 | 6 (all generated) |
| `agents` | 15 | 16 | 1 (generated) |
| `lib` | 102 | 104 | 2 (generated) |
| `workflows` | 2 | 3 | 1 (generated) |
| `hooks` | 55 | 63 | 8 |
| `rules` | 27 | 27 | 0 |
| `docs` | 11 | 72 | 61 |
| `notes` | 0 | 5 | 5 |
| `sounds` | 2 | 3 | 1 (generated) |

Excluding generated artifacts (`graphify-out/`, `__pycache__/`, `.DS_Store`), **64 live files are untracked**:

- 56 under `.claude/docs/superpowers/` (35 plans, 21 specs) and 1 under `.claude/docs/analysis/`, excluded by `.claude/.gitignore` (`docs/superpowers/`) and by `/.claude/docs/analysis/` at `.gitignore`.
- 5 under `.claude/notes/`, excluded by `.claude/.gitignore` (`notes/`). **`notes` is 0 tracked against 5 on disk**, so a release built today would deliver an empty `notes/`.
- `.claude/hooks/session-config-drift-check.sh` and `.claude/hooks/tests/session-config-drift-check.test.mjs`, excluded by the unanchored pattern `*session*` at `.gitignore:19`.

A cutover performed today would therefore silently empty `notes/` and drop 84% of `docs/`. Section 7 makes closing this gap a hard precondition, and section 5 makes it a validated one.

### 0.5 `settings.json` divergence, re-measured today

Live and repo copies have diverged in both directions. Live-only top-level key: `pluginConfigs`. Repo-only top-level key: `model`. Live grants `Bash(ln -sfn:*)` at `~/.claude/settings.json:20`; the repo copy grants no `ln` form at all.

Note the direction of the `model` difference against the earlier reading in the ledger: as of today `model` is **repo-only**, not live-only. The repo copy moved under `chore/config-drift` (`652c9af`). This is drift in the surface the SPEC exists to control, and it is a migration input, not a defect to correct silently.

### 0.6 An existing guard that interacts with this design

`.claude/hooks/protect-claude-config.sh` is a `PreToolUse(Edit|Write)` hook that returns `permissionDecision: "ask"` for writes to `settings.json`, `settings.local.json`, `CLAUDE.md`, `keybindings.json` and anything under `hooks/`, `rules/`, `lib/`, `workflows/` — both at `~/.claude` (`:51-53`) and in the checkout, which it discovers by realpath'ing `~/.claude/CLAUDE.md` and friends back into a git worktree (`:61-97`), falling back to a textual `.claude/<prefix>` match when that discovery fails (`:99-104`).

Two consequences, both carried in section 5 and section 9.

## 1. What this SPEC changes

Global config gains three states instead of one:

- **Staging** — any branch of this repository. Branch work never reaches a running agent.
- **Live** — `main`, materialized as an immutable release subtree under `~/.claude/releases/<sha>/`.
- **Promotion** — the single atomic act that moves live from one release to another.

"Sync on feature completion" becomes "converge live to `main`", because merging *is* feature completion.

## 2. Layout

```
~/.claude/                      mutable root (M1); Claude Code owns it
  releases/<sha>/               immutable, built by `git archive <sha> .claude`
                                skills agents lib workflows hooks rules docs
                                notes sounds CLAUDE.md keybindings.json
  current -> releases/<sha>     THE pointer
  skills   -> current/skills    one link per entry, all routed through current
  agents   -> current/agents
  lib      -> current/lib
  workflows-> current/workflows
  hooks    -> current/hooks
  rules    -> current/rules
  docs     -> current/docs
  notes    -> current/notes
  sounds   -> current/sounds
  CLAUDE.md-> current/CLAUDE.md
  keybindings.json -> current/keybindings.json
  settings.json                 REAL file, never promoted (section 6)
  local/                        declared live-only overlay
  LIVE                          receipt {ref, sha, built_at, promoted_at, previous, repo_root}
  plugins/ sessions/ projects/ .claude.json backups/   runtime state, never promoted
```

Eleven entry links plus one pointer replace today's 37 links.

**The `current` indirection is load-bearing.** Linking each entry straight at a release would make promotion 11 renames instead of 1, destroying the atomicity being bought. Two-hop resolution is evidenced by M3, not assumed.

### 2.1 What the entry-link collapse forces

Making `hooks` and `rules` whole-directory links has three forced consequences, each a migration task rather than an implementation detail:

1. **`~/.claude/rules/context7.md` must be adopted into the repo.** It is untracked, live-only, and loaded into every session as a global instruction. Once `rules` is a single link into an immutable release, a live-only file has nowhere to sit beside it. It is plain instruction text with no secret, so it is adopted rather than pushed to `local/`.
2. **Generated output must move out of the promoted subtrees.** `~/.claude/hooks/graphify-out/` and `~/.claude/rules/graphify-out/` exist today because those directories are writable. After cutover they are read-only release content, and the graphify hooks would fail on write. Their output path must be relocated (the depth-1 `~/.claude/graphify-out/` already exists) **before** cutover.
3. **`local/` is declared, not discovered.** It holds genuinely machine-specific files only. `plugins/` stays live-only forever.

## 3. The promote verb

One idempotent entry point. Given a desired ref (default `main`):

1. Resolve ref to sha.
2. If `releases/<sha>` is absent, build it: `git archive <sha> .claude` extracted into `<sha>.tmp`, then renamed into place. A release directory therefore never exists in a partially-built state.
3. **Validate** the candidate (section 5). Failure means no swap.
4. **Swap**: `ln -s releases/<sha> current.tmp && mv -f current.tmp current`.
5. Write the `LIVE` receipt, carrying the previous sha.
6. Garbage-collect to the 5 most recent releases, never deleting `current` or its predecessor.

**The swap is create-then-rename, not `ln -sfn`.** `ln -sfn` unlinks then symlinks, leaving a window in which no pointer exists; `rename(2)` replaces an existing entry atomically. The live permission set grants `Bash(ln -sfn:*)` at `~/.claude/settings.json:20` and therefore encodes the wrong form — correcting that grant is part of this work. Verify the atomicity guarantee against `man 2 rename` on this machine at implementation time rather than trusting this paragraph.

**Idempotence** comes from comparing `realpath(current)` against `releases/<sha>` before swapping. A promote to the already-live sha does nothing and reports nothing.

## 4. Enforcement

Live is `main`; staging is everything else. One verb, three call sites:

| Call site | Kind | Action |
|---|---|---|
| SessionStart | hook | converge |
| Stop | hook | converge |
| mitosis Ship, after merge | engine | promote |

**This is a convergence check, not an event handler.** An event can be missed — a process dies, a merge happens from the web UI, a branch is merged by a collaborator. Comparing the desired ref against the `LIVE` receipt cannot be missed, because it re-derives the answer from scratch every time.

**The teeth are that SessionStart and Stop are hooks.** The harness runs them; the model cannot decline them. That is precisely what makes the sync never a suggestion. A verb the model is merely instructed to call would be a suggestion no matter how the instruction is worded.

When live differs from `main` at session start, a drift report is surfaced into session context, so divergence is visible rather than silent.

## 5. Safety

### 5.1 Validation, before every swap

The candidate release is validated before the pointer moves. Failure means no swap, a loud drift report, and live stays on the last good release.

1. **Coverage** — every entry the live links expect exists in the candidate and is non-empty. This is the check that catches section 0.4: a release whose `notes/` is empty fails validation instead of silently emptying live.
2. **Hook resolution** — every hook command path registered in `settings.json` resolves to a file inside the candidate or inside `local/`.
3. **Executability and syntax** — hook scripts are executable and pass `node --check` or `bash -n` by extension.
4. **Parse** — every JSON file in the candidate parses.

### 5.2 Rollback

Swap `current` to `LIVE.previous`. A rename, never a rebuild, because releases are immutable and retained.

### 5.3 Named invariant — the bootstrap lives outside the thing it promotes

**The promote verb and the SessionStart hook that calls it MUST live outside `releases/` at a stable absolute path.** A bootstrap self-hosted in the release it promotes means a bad release breaks the machinery that would roll it back, in every future session. This is the one way the design can brick the environment, and it is an invariant, not an implementation detail.

Concretely: these two files live under `~/.claude/local/`, and validation checks that neither resolves inside a release.

### 5.4 Releases are never edited in place

Every release is built by `git archive` and thereafter read-only. This is what preserves the meaning of `protect-claude-config.sh`: that guard covers `~/.claude/hooks/**` but not `~/.claude/releases/<sha>/hooks/**`, so a design that edited releases in place would route config edits around an existing security control. The prohibition is what closes that hole.

## 6. `settings.json`

Excluded from releases entirely. M2 refutes inclusion outright: write-through would mutate a release in place, and any setting written while release A is live would be stranded in A when the pointer swaps to B.

- The **repo** tracks the *declared* config: `hooks`, `permissions`, `env`.
- **Live** is the *effective* config Claude Code writes into.
- **Promotion** recomputes live as repo-owned keys combined with preserved live-owned keys (`model`, `pluginConfigs`, `extraKnownMarketplaces`, plugin enablement, permission grants), driven by an **ownership manifest**.
- **Unknown or newly-appearing keys default to LIVE WINS and are flagged for classification, never silently dropped.** Claude Code adds keys on its own schedule and the manifest will always lag.

Chosen over a three-way merge because promotion runs from unattended hooks, and a merge conflict at SessionStart has no one to resolve it. Determinism beats generality where the resolver is a hook.

### 6.1 Capture is a separate verb, and it is the only direction that can leak

**CAPTURE (live to repo) is explicit and separate from promotion.** Promotion cannot leak; capture can, and this repository is public. Capture therefore runs through the leak gate before it touches tracked content.

Capture is also the direction that must reconcile the existing divergence in section 0.5 — the broader live permissions, live-only `pluginConfigs`, and the repo-only `model` key.

Two properties of the existing environment compose here rather than needing new machinery: an agent-driven capture writes through `Edit`/`Write`, so `protect-claude-config.sh` raises an `ask` on every capture into the guarded paths, and `.claude/hooks/secret-scanner.sh` blocks high-confidence secret patterns on the same tool calls.

## 7. Migration

**The cutover is itself a hot swap, which is the hazard.** It runs in a session doing nothing else.

Preconditions, all of which must hold before any live entry is touched:

1. **Close the coverage gap (section 0.4).** Adopt the 64 untracked live files, or explicitly reclassify them as `local/` or as generated. `notes/` at 0 tracked files is the sharpest case.
2. **Narrow `*session*` at `.gitignore:19`.** The pattern is unanchored and matches any path containing the substring. Until it is narrowed, adopting `hooks/session-config-drift-check.sh` will appear to succeed and the file will still never enter a release. Adoption performed before this is fixed is adoption that silently did nothing.
3. **Relocate generated output** out of `hooks/` and `rules/` (section 2.1).
4. **Adopt `rules/context7.md`.**
5. **Place the bootstrap** — promote verb and SessionStart hook — outside `releases/` (section 5.3).

Order of the cutover itself:

1. Build and validate the first release with **zero live change**. A failure here means nothing moved.
2. Swap every entry link in one pass.
3. Write the first `LIVE` receipt.

Any failure at step 1 leaves the environment exactly as it was.

## 8. Out of scope

`plugins/`, `sessions/`, `projects/`, `.claude.json` and `backups/` are runtime state and are never promoted. Nothing in SPEC B — engine cost, monolith decomposition, stacked PRs — is in scope here. The fix pipeline is out of scope for both SPECs.

## 9. Residuals, risks, and what this SPEC does not settle

- **Cross-file mixing is accepted and unmitigated.** Immutable releases plus one rename guarantee no *file* is ever read half-old. They do **not** guarantee cross-file consistency: if resolution is live, a session could hold one release's skill roster while reading another release's skill bodies. Retention does not fix this, because reads route through the pointer rather than a pinned release. The mitigation is timing — promote at SessionStart and between MSPs at Ship, never mid-MSP.
- **Whether a pointer swap reaches an already-running session is unmeasured.** Headless `claude` cannot authenticate under a scratch config dir (`"Not logged in - Please run /login"`); this session's auth is host OAuth refresh bound to the parent process and does not follow a child CLI given a different config dir. Static inspection of the 2.1.223 binary was inconclusive in both directions. **This SPEC must not be read as though the question is solved.** It changes the promotion-timing contract in section 4, not the choice of mechanism: if swaps are invisible mid-session the timing rule is belt-and-braces; if they are live it is load-bearing. Three ways to close it are recorded in the ledger session event `2026-08-06T20-05-54-286Z`; a controlled live probe re-pointing one existing hook symlink is the cheapest.
- **Only one `settings.json` writer was measured.** If in-session `/config` edits or permission-grant persistence *replace* the file rather than write through it, the ownership manifest still holds, but the file-identity assumption behind it needs re-checking.
- **`protect-claude-config.sh` loses its worktree-verified path.** It discovers the checkout by realpath'ing `~/.claude/CLAUDE.md` (`:64-68`); after cutover that resolves into `~/.claude/releases/<sha>/`, which is not a git worktree, so `git worktree list` fails, `derived` stays false, and the guard falls through to its textual `.claude/<prefix>` heuristic (`:99-104`). The paths that matter still prompt, so this is a weakening rather than a hole: the guard can no longer confirm that a `.claude` path belongs to a real checkout. Fix it in the same change by reading the repo root from the `LIVE` receipt (`repo_root`) instead of inferring it from a symlink target.
- **The ownership manifest is maintenance debt by construction.** It lags every key Claude Code adds. LIVE WINS plus flagging keeps that lag safe rather than eliminating it.

## 10. Acceptance criteria

1. Promotion is a single `rename(2)`; no intermediate state exists in which `~/.claude/current` is absent.
2. Running the promote verb twice against the same ref produces no second swap and no side effects.
3. A candidate release missing any expected entry, or carrying an unresolvable, non-executable or syntactically invalid registered hook, fails validation and does not swap.
4. Rollback to the previous release requires no rebuild.
5. The promote verb and the SessionStart hook resolve outside `releases/`, and validation fails if either does not.
6. A branch that is not `main` never reaches a running agent.
7. Live differing from `main` at session start is visible in session context.
8. `settings.json` survives promotion with every live-owned key intact and every repo-owned key applied; an unrecognized key survives and is flagged.
9. Capture cannot write tracked content without passing the leak gate.
10. After cutover, `git archive`-built releases contain every file that is live today — verified by diffing the live tree against the release, not asserted.
