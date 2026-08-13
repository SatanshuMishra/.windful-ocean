# Maximum-autonomy permission architecture

Status: RATIFIED 2026-08-13, not implemented. Authored 2026-08-13. Amended 2026-08-13 (Wave 0).
R1 through R6 were ratified by the user on 2026-08-13, and the three guard amendments from the section 11 pressure test (D1, D2, D4) plus the D6 mechanism correction were applied at the same time. Sections 2 and 4 below carry the amended text; section 11 preserves the pre-amendment reasoning.
Wave 0 — the experiment wave that settled U1 through U7, re-measured D6's mechanism a second time, and surfaced a settings-promotion pipeline this SPEC did not originally know about — ran later the same day against Claude Code 2.1.231 on macOS 26.5.1. It refuted U2's and M17's assumptions, refuted then resolved U3's, disqualified the D6 mechanism this SPEC had just adopted, and found two silent self-destruct paths and a rollback hazard in the pipeline that carries this SPEC's own guard set into effect. Sections 0.6 through 0.8 record the new facts; sections 2, 4, 5, 6, 7 and 10 carry the resulting amendments; section 8 replaces its open-question table with verdicts. Section 11 is untouched — it is pre-amendment history and stays that way. `2026-08-13-maximum-autonomy-U1-U7-findings.md`, beside this file, is the full evidence record.
Supersedes the operative goal of the 2026-08-01 permission config audit, which assessed the configuration against Anthropic's published recommendations. That alignment is deliberately traded away here.

This SPEC is standalone. Every fact in section 0 was measured on 2026-08-13 or quote-grounded in official documentation on the same date. Provenance is marked per fact: `[orchestrator]` means confirmed directly in this session, `[agent]` means produced by a dispatched research agent with the cited source.

Goal, in one sentence: let a task be started and left unattended overnight, and have every task in it complete, by removing gates whose only justification is a recovery path that already exists — while keeping a small, deterministic guard set on the operations from which no recovery exists at all.

## 0. Verified ground truth

### 0.1 The safety net that is assumed to exist does not

- **M1. The Claude Code sandbox is off.** No `sandbox` key is present in `~/.claude/settings.json`. `[agent]`
- **M2. There is no filesystem snapshot layer.** `tmutil destinationinfo` reports no destinations configured; `tmutil listlocalsnapshotdates` is empty. No Time Machine snapshot has ever been taken on this machine. `[agent]`
- **M3. There is no container runtime available.** Docker.app is installed but its daemon is down; no colima, podman, orbstack, lima or UTM is present. `[agent]`
- **M4. Disk headroom is not a constraint.** 982 GiB free of 1.8 TiB. Source churn is roughly 14 MB/day. A snapshot-heavy week costs single-digit to low-double-digit GB. `[agent]`
- **M5. `/usr/bin/trash` is present.** A recoverable `rm` is available today with no installation. `[agent]`

### 0.2 The live configuration is not the repository

- **M6. `~/.claude/hooks` is a release snapshot, not the working tree.** It resolves `hooks -> current/hooks -> releases/482dc7d2dee4b27ccc913a5cc47a4b825f44f365/hooks`. The repo and live copies of `block-destructive-bash.sh` are distinct files: inode 146185942 versus 147457416. `[orchestrator]`
- **M7. Promotion is automatic, and can silently refuse.** `converge.mjs` is registered on `SessionStart` and on `Stop` in `~/.claude/settings.json`, and auto-promotes repo HEAD into `current` on drift. `promote.mjs` runs `validate.mjs` first; a rejected candidate leaves live pinned to the last-good release without a loud failure. `[orchestrator]`
- **M8. Live settings carry undocumented drift.** `~/.claude/settings.json` holds an allow entry, `Bash(node:*)`, that the repository's committed `.claude/settings.json` does not. Deny arrays are set-identical at 47 entries. `[agent]`

### 0.3 The friction is measured, and it compounds

- **M9. `.claude/settings.local.json` holds 202 allow rules, 0 deny, 0 ask.** The majority are full-argv literals scoped to expired `/private/tmp/claude-501/.../<session-uuid>/` scratch paths that can never match a future session. The file grew from 199 to 202 entries during the single session in which this SPEC was authored. `[orchestrator]`
- **M10. No `mcp__*` entry exists in any allow list.** Three MCP servers are configured globally for this project. Every MCP tool call therefore falls through to the default prompt. `[agent]`
- **M11. The current Bash gate costs about 145 ms per call.** Component measurements: `block-destructive-bash.sh` 145 ms, `protect-claude-config.sh` 48 ms, `secret-scanner.sh` 47 ms, node interpreter floor 32 ms, python3 floor 22 ms. `[agent]`
- **M12. `git stash create` costs 19 ms** and returns a commit sha without touching the stash stack. `[agent]`

### 0.4 Mechanism semantics, quote-grounded

- **M13. A PreToolUse hook returning `allow` does not bypass permission rules.** "Hook decisions don't bypass permission rules. Claude Code evaluates deny and ask rules regardless of what a PreToolUse hook returns" — [permissions](https://code.claude.com/docs/en/permissions). `[agent]`
- **M14. `deny` and explicit `ask` rules survive every mode, including `bypassPermissions`; `allow` rules are inert there.** — [permission-modes](https://code.claude.com/docs/en/permission-modes). `[agent]`
- **M15. A PreToolUse hook exit code 2 blocks in every mode**, firing before any permission-mode check — [hooks-guide](https://code.claude.com/docs/en/hooks-guide). `[agent]`
- **M16. In a non-interactive run, auto mode does not stall — it silently skips.** "The action doesn't run and Claude keeps working... Claude Code doesn't stop the run" — [permission-modes](https://code.claude.com/docs/en/permission-modes). Interactive auto mode instead resumes prompting after 3 consecutive or 20 total classifier blocks, thresholds documented as not configurable. `[agent]`
- **M17. `bypassPermissions` requires a one-time interactive acceptance dialog on the machine**, and a background session is refused until that dialog has been accepted in a prior interactive session. It also refuses to start as root outside a recognized sandbox. `[agent]` **REFUTED 2026-08-13 for the non-interactive `-p --permission-mode` argv path — see M32 (section 0.6) and section 5. Not tested for interactive TTY, `--bg`, or cloud sessions; the refutation does not extend to them, and this claim stands unrefuted there.**
- **M18. Protected paths (`.git`, `.claude`, `.env`-adjacent) are never auto-approved by allow rules in any mode except `bypassPermissions`.** The list is hardcoded, not configurable. `[agent]`
- **M19. `auto` mode, the `autoMode` block and `sandbox.network.strictAllowlist` are ignored when set in project or local settings.** They are honored only from `~/.claude/settings.json`, managed settings, or `--settings`. `[agent]`

### 0.5 The recovery windows that decide the guard set

- **M20. GitHub repository deletion is self-service recoverable for 90 days** — [docs.github.com](https://docs.github.com/en/repositories/creating-and-managing-repositories/restoring-a-deleted-repository). `[agent]`
- **M21. Git reflog defaults are 90 days reachable, 30 days unreachable, 2 weeks prune grace** — [git-gc](https://git-scm.com/docs/git-gc). `[agent]`
- **M22. Supabase's free tier ships with no automatic backups at all** — [supabase.com](https://supabase.com/docs/guides/platform/backups). A destructive query there has no undo. `[agent]`
- **M23. Uncommitted and untracked work has a zero-length recovery window.** `git reset --hard` and `git clean -fdx` destroy state that was never a git object, and M2 establishes there is no snapshot underneath. `[agent]`

### 0.6 U1 through U7, resolved, and one existing fact overturned (Wave 0, 2026-08-13)

- **M24. A PreToolUse hook returning `allow` suppresses the auto-mode classifier itself, not merely the interactive prompt.** Verified by paired control: the same `chmod 777` command, the same auto mode, differing only by the hook's presence. Without it the file was unchanged and the debug log recorded a classifier block; with it the file changed and the classifier was never invoked. `[agent]` — resolves U1.
- **M25. A broad `Bash(*)` allow rule is silently discarded in auto mode.** The debug log records `Ignoring dangerous permission Bash(*) ... (bypasses classifier)`, and the command then falls through to the classifier and is blocked — a rejection visible only at debug level, never in the transcript. A narrow rule such as `Bash(chmod:*)` both executes and skips the classifier entirely. `default` mode honors `Bash(*)` normally; this is specific to `auto` mode. `[agent]` — resolves U2, and inverts section 6 step 3 and section 4 Layer 2.
- **M26. The sandbox blocks loopback by default.** `NO_PROXY` contains `localhost,127.0.0.1,::1`, so loopback traffic bypasses the proxy that implements the domain allowlist and is denied at the network layer with EPERM. Adding `localhost` to `allowedDomains` does not help — the allowlist is structurally unreachable for loopback. Separately, under the default `sandbox.allowUnsandboxedCommands`, a command the sandbox denies is silently re-run fully unsandboxed and reported as succeeded. `[agent]` — resolves U3's first half; refutes the assumption that enabling the sandbox alone, as Layer 0 originally read, is sufficient.
- **M27. The fix for M26 is one documented key set, verified together:** `sandbox.enabled: true`, `sandbox.allowUnsandboxedCommands: false`, `sandbox.failIfUnavailable: true`, `sandbox.network.allowLocalBinding: true`. Under it: loopback connects and returns 200; writes inside cwd succeed; writes to `$HOME` and into the repository are denied with EPERM; `~/.ssh` reads are denied; external HTTPS still returns 403 from the allowlist proxy; the process carries `SANDBOX_RUNTIME=1`. `allowLocalBinding` was isolated as the single causal key that unblocks loopback. The full schema the installed build accepts is `sandbox.filesystem.{disabled, allowRead, denyRead, allowWrite, denyWrite, readOnly}` and `sandbox.network.{allowedDomains, deniedDomains, allowLocalBinding, allowUnixSockets, allowAllUnixSockets, allowMachLookup, excludedCommands}` — there is no `network.disabled`. `[agent]` — resolves U3's second half; Layer 0 is amended, not dropped.
- **M28. `tmutil localsnapshot` succeeds with no Time Machine destination configured:** exit 0 in 0.322 s, no privilege prompt. macOS warns that local snapshots are purgeable and may be removed at any time. `[agent]` — resolves U4.
- **M29. The PreToolUse `updatedInput` rewriting facility works in the installed version.** A hook rewrote `rm <file>` to `/usr/bin/trash <file>`; the file was recovered intact from the Trash, and the same command without the hook destroyed it. `~/.Trash` is TCC-protected, so listing the directory fails while `stat` on the exact recovered path succeeds — verification must stat the exact path, never list the directory. `[agent]` — resolves U5.
- **M30. `defaultMode: "bypassPermissions"` is honored from project settings; it does not share `auto`'s restriction to user settings, managed settings or `--settings` (M19).** It is superseded in practice by a CLI flag: `claude --help` documents `--permission-mode <mode>` as a first-class flag accepting `bypassPermissions`. `[agent]` — resolves U6; section 5 adopts the flag over the settings key.
- **M31. `validate.mjs` rejects on ten distinct checks:** missing or empty expected entries, hook path resolution failure, hook containment escape, non-regular hook target, non-executable hook invoked bare, undeterminable hook language, hook syntax check failure, unparseable JSON anywhere in the tree, symlink escape from the release, and bootstrap tools resolving inside `releases/`. It is a SYNTAX gate only — it never executes hook logic, so a behaviorally wrong permission gate passes validation and promotes to live. `[agent]` — resolves U7; see section 0.8 and section 10.
- **M32. M17 is REFUTED for the non-interactive argv path.** `claude -p --permission-mode bypassPermissions` in a scratch directory reported `init.permissionMode: bypassPermissions`; performed a write outside the working directory — one `default` mode blocks at the workspace write boundary — that succeeded; recorded `permission_denials: 0`; exited 0 with empty stderr; showed no acceptance dialog; and needed no `--allow-dangerously-skip-permissions`, the mode flag alone sufficing. Scope: only the non-interactive `-p` argv path was tested. An interactive TTY session, a `--bg` session, and a cloud session were NOT tested, and this refutation must not be generalized to them. `[agent]` — see M17 above and section 5.

### 0.7 The D6 mechanism, re-measured (Wave 0, 2026-08-13)

- **M33. Run at the SUPERREPO root, the temp-index checkpoint captures nested repositories as empty gitlinks.** The eight worktrees under `.claude/worktrees/`, holding the actual parallel agent work D6 exists to protect, are captured NOT AT ALL. Median 795 ms. `[agent]` — the superrepo variant is disqualified.
- **M34. Run at the WORKTREE root, the same mechanism captures that worktree's real content:** 1,731 blobs, 31.3 MiB, zero gitlinks. Median 259 ms. `[agent]` — this is the required form; D6's checkpoint must run per-worktree, never at the superrepo root.
- **M35. Plain `git add -A` against a fresh temporary index silently drops tracked files that match `.gitignore`,** because every path looks new to a fresh index and ignore rules apply to new paths. `--force` is therefore a correctness requirement for capturing ignored content, not an option. Reproduced on a controlled scratch repository; untracked-file capture was confirmed on the same repository. `[agent]`
- **M36. Of the 259 ms median in M34, roughly 220-250 ms is attributable to this repository's own no-op `core.hooksPath` shim chain,** which fires `reference-transaction` and `post-index-change` hooks on every index write — not to the checkpoint mechanism itself. `[agent]` — the mechanism's cost in a repository without this repo's hook chain is unmeasured and is likely much closer to the low tens of milliseconds.

### 0.8 The settings-promotion pipeline — a constraint this SPEC did not originally know about (Wave 0, 2026-08-13)

- **M37. Promotion reconciles repository settings into live settings through an ownership model (`manifest.mjs`).** Repo-owned keys, which the repo fully replaces on every promotion: `$schema`, `env`, `hooks`, `includeCoAuthoredBy`, `statusLine`, and `permissions.deny`. Live-owned keys, which the repo's declaration is ignored for: `model`, `theme`, `enabledPlugins`, `effortLevel`, `tui`, and nine others (fourteen total). `permissions.allow` is UNIONED and only ever grows; the sole retraction channel is a frozen, hardcoded array. Any unclassified key resolves live-wins-if-live-already-has-it, else-repo's-value-lands — meaning it ships once and then freezes permanently, with every later repo revision to that key silently inert. `[agent]` — the constraint section 2 D2 and section 4 Layer 4 did not originally account for.
- **M38. Two self-destruct paths follow directly from M37, both live and unmitigated.** A repo-owned key ABSENT from the repo is DELETED from live. A pull request that omits the `hooks` key strips every hook from live, including the converge tool itself, and passes validation cleanly, because the syntax gate (M31) returns no failures when there are no hook registrations to check. `permissions.deny` has the identical shape — section 6 step 1 edits exactly that key. `[agent]`
- **M39. `converge.mjs` runs on `SessionStart` and `Stop`, compares live against LOCAL `refs/heads/main` resolved from the git object database, and promotes on drift.** It refuses any ref but `main`, never reads `HEAD`, and never reads the working tree or fetches. Consequence: parallel worktree development is safe, since only advancing local `main` triggers a release; a pull request merged on GitHub does NOT become live until a human separately advances local `main`. `[agent]`
- **M40. Rollback undoes itself.** Because convergence promotes whenever live differs from local `main`, a rolled-back release is re-promoted at the next `SessionStart` or `Stop` unless a human also moves the `main` pointer back at the same time. This is a live hazard today, not a hypothetical one. `[agent]`
- **M41. `promote.mjs`'s own CLI accepts an arbitrary `--ref` with no main-only restriction;** the main-only guard exists only in `converge.mjs`, not in the lower-level tool. `[agent]`
- **M42. `--settings` accepts inline JSON, not only a file path.** Nothing this architecture governs — pull request, review, merge, `validate.mjs`, `promote.mjs` — governs argv. A caller can inject permission rules at command-line precedence, outranking project and local settings. `[agent]`
- **M43. `--settings` performs a deep merge, not a wholesale key replacement.** A profile containing only `{"env":{"PROBE":"1"}}` produced a shell environment carrying BOTH the injected key and the other scope's existing `env` entries, and an unrelated project-scope `permissions.deny` rule still fired. Object-valued keys merge per inner key rather than being replaced wholesale — the natural reading of the documentation is wrong. `[agent]`
- **M44. A `--settings` profile can disable a single plugin without restating the rest.** `{"enabledPlugins":{"logbook@logbook":false}}` dropped the plugin count from 15 to 14, removed only that plugin's MCP server, left the other six plugins untouched, and reduced hook counts by exactly one on every event. Because `enabledPlugins` is live-owned (M37), a repository declaration of it is never applied — the repository's own second alias, `logbook@continuity-ledger`, is inert for exactly this reason, and live carries one alias. `[agent]` — the mechanism section 6 step 9 and R6 rely on.

## 1. The principle

Gate on whether an intact copy of the prior state survives somewhere the agent did not just touch, and on whether effects escape this machine onto shared, published, or third-party state. Never gate on the command's name.

Three questions decide any operation:

1. Does an intact copy of the prior state exist right now, somewhere the agent did not just touch?
2. Is that copy's window open long enough for a sleeping human to notice — hours to days, not seconds?
3. Do the effects stay inside the agent's own workspace?

An operation is guarded only when it fails one of these. Everything else runs.

The corollary that does the most work: **a prompt is not the only control.** Where reversibility can be manufactured cheaply, it replaces the gate entirely, because a gate at 3am is an abort and a checkpoint at 3am is a non-event.

## 2. The guard set — five decisions to ratify

Each is stated as a decision the user accepts or rejects independently.

### D1. Secrets leaving the machine — GUARD (amended 2026-08-13)

The guarded surface is OUTBOUND MOVEMENT, not authorship. Two paths compose it: a read of a credential-shaped file, and network egress carrying credential-shaped data off the machine.

The write-side secret scanner is retained, but as separate hygiene under its own justification. It is NOT D1's implementation and must not be counted as satisfying D1.

Rationale for the amendment: D1 exists because disclosure is the one genuinely one-way door — rotation prevents future misuse, cannot undo past use, and the number of parties who already copied the value is unknowable. A guard on writing a secret does not address that; a secret can be written and never disclosed, or disclosed without ever being written to a file. Gating the write is gating a proxy. Both GitHub's and AWS's own guidance converge independently on "rotate, do not attempt cleanup", which is a statement about disclosure, not about authorship.

Cost to autonomy: near zero. Ordinary development does not move credentials outbound. The false-positive cost that does exist — a token-shaped string in a test fixture — now lands on the hygiene scanner rather than on the catastrophe gate, where a false positive costs one blocked write the agent can route around rather than an aborted task.

### D2. The recovery layer itself — GUARD, with a mandatory maintenance path (amended 2026-08-13)

`git reflog expire`, `git gc --prune=now`, `tmutil deletelocalsnapshots`, deletion of checkpoint refs, emptying the Trash, deletion of cloud backups or snapshots, and edits to the gate implementation or the deny list.

Rationale: this is the meta-catastrophe. It does no damage alone. It silently converts every adjacent mistake, past and future, from recoverable into permanent. A control the agent can disarm is not a control.

**Mandatory companion — an age-based reaper outside the agent's reach.** Because the agent may not prune the recovery layer, the recovery layer has no maintenance path unless one is built deliberately. Checkpoint refs accumulate per mutating tool call and snapshots accumulate hourly; a heavy week produces thousands of refs and tens of gigabytes. The reaper expires checkpoint refs and local snapshots older than a fixed window, runs on a scheduler rather than by agent invocation, and is never reachable from a tool call.

Shipping D2 without this reaper is a defect, not an omission: layer 1 fills the disk, macOS begins thinning snapshots silently under pressure, and the result is failure mode one in section 10 — the reversibility layer dying quietly while continuing to look present.

**Related hazard found 2026-08-13, outside D2's original scope.** D2 guards the agent from disarming the recovery layer or the gate. The settings-promotion pipeline can produce the identical outcome — the gate and its deny list silently absent from live — without any agent action at all: `hooks` and `permissions.deny` are repo-owned keys in the promotion manifest (M37), so a pull request that merely omits one deletes it from live on the next promotion, passing validation cleanly because the syntax gate finds nothing to reject when there are no registrations (M38). This is not a D2 violation — no agent touched the recovery layer — but it defeats D2's purpose through a different door. See section 0.8, section 4 Layer 4, and section 10.

Cost to autonomy: near zero. These commands have no role in ordinary development.

### D3. Remote and production state — GUARD

Remote database verbs, deploys, infrastructure destruction, and anything reaching a hosted project rather than local state.

Rationale: off this machine, so no local snapshot or checkpoint reaches it. M22 makes this concrete for this stack specifically — the default Supabase tier has no backups at all.

**Scope limit the gate must honor.** The guard covers REMOTE targets only. The carve-out ratified 2026-07-06 permitting local disposable containers for tests — `supabase start`, `supabase db reset`, pgTAP against a throwaway local container seeded with synthetic data — is explicitly outside D3 and must not be matched by the gate. Without this limit the agent writes a migration it cannot validate, and the overnight run completes with its riskiest artifact untested, which is exactly the silent-incompleteness failure this design exists to prevent.

Cost to autonomy: zero. This is the existing no-direct-DB-access rule, already ruled to keep unchanged on 2026-08-13. Authoring migration SQL for a human to apply is unaffected.

### D4. Irreversible outbound actions — GUARD, narrowed (amended 2026-08-13)

Guarded: actions with NO retraction mechanism that reach parties outside the user's own accounts. Sending email, publishing a package, making a payment, calling a non-idempotent third-party API that performs a real-world action.

Explicitly NOT guarded: issue and pull-request comments, reviews, and similar collaboration actions on repositories the user owns. These are deletable, they are routine workflow, and gating them would block a large fraction of ordinary work every night.

Rationale for the narrowing: the original wording said "posting publicly", which over-matches. Deletability is the discriminator that matters, not audience. A comment on one's own repository has a retraction mechanism and reaches no party outside the user's own account; an email has neither property. The test is whether a retraction exists, not whether the action is visible to someone.

Cost to autonomy: near zero once narrowed. As originally stated it was materially non-zero, which is what the pressure test surfaced.

### D5. Making private state public — GUARD

Repository visibility changes to public, bucket ACL changes, and equivalent exposures.

Rationale: the same disclosure mechanism as D1, applied to bulk data. GitHub's own documentation describes effects of a visibility flip that cannot be undone even at the platform's own bookkeeping layer, before counting external clones.

Cost to autonomy: zero.

### D6. Destructive local operations — CHECKPOINT, NOT GUARD

`git reset --hard`, `git checkout -- .`, `git restore .`, `git clean -fd`, `git stash drop`, `rm -rf` inside the repository and its worktrees, force-delete of a branch.

Rationale: M23 establishes that uncommitted and untracked work has no recovery window, which makes this the most probable real loss a coding agent causes. Because a checkpoint is cheap and a prompt at 3am is an abort, the correct response is to snapshot and proceed rather than to stop and ask. The checkpoint is pinned under a dedicated ref namespace so garbage collection cannot reap it, and the operation runs.

**Mechanism correction, 2026-08-13.** `git stash create` is REJECTED as the checkpoint mechanism. It cannot capture untracked files, and untracked files are precisely the class D6 exists to protect (M23). A checkpoint that omits them fails at exactly the case that justifies it. The required mechanism instead stages everything into a temporary index and writes a commit object from it — temp-index `add -A`, `write-tree`, `commit-tree`, pin the ref — so that untracked and ignored content is captured alongside tracked content.

The M12 measurement of 19 ms belongs to the rejected mechanism and does NOT carry over. The latency budget in section 4 must be re-measured against the temp-index form before it is relied upon; it will be higher, and it scales with working-tree size rather than with diff size.

**Re-measurement, 2026-08-13 (Wave 0).** The temp-index form above was measured, and one of its two possible variants is itself disqualified. Run at the SUPERREPO root it captures the eight worktrees under `.claude/worktrees/` — the actual parallel agent work D6 exists to protect — as empty gitlinks, missing their content entirely (M33, median 795 ms). Run at each WORKTREE's own root it captures that worktree's real content with zero gitlinks (M34, median 259 ms). The required mechanism is therefore per-worktree, never per-superrepo. Separately, `git add -A` against the fresh temporary index must pass `--force`, or gitignored-but-tracked content is silently dropped because every path looks new to a fresh index (M35) — this is a correctness requirement, not a tuning choice. Of the 259 ms median, roughly 220-250 ms is this repository's own `core.hooksPath` shim overhead rather than the mechanism itself (M36), so the re-measured latency budget in section 4 should be read as an upper bound measured under local conditions, not a mechanism-intrinsic cost. The 19 ms figure and the superrepo variant are both dead; the per-worktree, `--force`d, temp-index checkpoint at roughly 259 ms median is what section 4 Layer 1 now specifies.

This is the single reclassification that converts the largest number of current stalls into proceeds.

## 3. Deliberately ungated

Each has a real, dated recovery window long enough for a human to notice the next morning. Gating any of them costs a night's work and buys nothing.

| Operation | Recovery path |
|---|---|
| `git push --force` on a personal branch | Reflog, 90/30 days (M21) |
| `git reset --hard`, `branch -D` on committed work | Reflog (M21) |
| `git clean -fd`, `rm -rf` inside the repo | Checkpoint (D6) plus snapshot (layer 1) |
| Repository deletion | 90-day self-service restore (M20) |
| Branch deletion linked to a PR | One-click restore, no documented expiry |
| Merging a PR to the default branch | `git revert` |
| npm unpublish, burned version number | Bump the version; functionally irrelevant |
| Card payment through a payment API | Merchant-initiated refund, no bank approval needed |
| A runaway CI job | Hard-blocked at quota with no payment method on file |
| Worktree cleanup | Explicitly ruled allowed by the user, 2026-08-13 |

Force-push to a *shared* branch is the one row here carrying residual doubt: no vendor documentation states a server-side retention window for unreachable objects. It is placed under D2's spirit rather than this table when the target is a branch another party consumes.

## 4. Architecture — five layers

Ordered by dependency. Each layer's absence is a hole in the one above it.

### Layer 0 — Isolation (amended 2026-08-13)

Enable the sandbox in `~/.claude/settings.json` with the full verified key set below, not `sandbox.enabled` and `failIfUnavailable` alone as originally specified. M26 found the default configuration's containment illusory in two compounding ways: the sandbox blocks loopback by default (`NO_PROXY` contains `localhost,127.0.0.1,::1`, so loopback bypasses the allowlist proxy and is denied at the network layer with EPERM, and adding `localhost` to `allowedDomains` cannot fix this because the allowlist is structurally unreachable for loopback traffic); and under the default `sandbox.allowUnsandboxedCommands`, a command the sandbox denies is silently re-run fully unsandboxed and reported as succeeded — the opposite of what `failIfUnavailable` was meant to buy.

The verified configuration (M27): `sandbox.enabled: true`, `sandbox.allowUnsandboxedCommands: false`, `sandbox.failIfUnavailable: true`, `sandbox.network.allowLocalBinding: true`. Under it, loopback connects and returns 200, writes inside cwd succeed, writes to `$HOME` and into the repository are denied with EPERM, `~/.ssh` reads are denied, external HTTPS still returns 403 from the allowlist proxy, and the sandboxed process carries `SANDBOX_RUNTIME=1`. `allowLocalBinding` is the single causal key that unblocks loopback without opening anything else.

The full schema the installed build accepts is `sandbox.filesystem.{disabled, allowRead, denyRead, allowWrite, denyWrite, readOnly}` and `sandbox.network.{allowedDomains, deniedDomains, allowLocalBinding, allowUnixSockets, allowAllUnixSockets, allowMachLookup, excludedCommands}`. There is no `network.disabled` key.

What it buys: writes outside the working directory become impossible at the OS level, enforced on child processes, rather than being merely disallowed by a rule that sees only a command string. An impossible action needs no gate.

What it does not cover: the Read, Edit and Write tools, which are governed by the permission system rather than the sandbox; and hooks and MCP servers, which run unconstrained on the host.

**The default configuration must be documented as unsafe.** `sandbox.enabled: true` alone — the shape this section originally specified — leaves `allowUnsandboxedCommands` at its permissive default and leaves loopback unreachable, so a locally running dev server cannot be probed, and a denied command silently escapes containment while reporting success. Layer 0 is not dropped; it is amended with the key set above, and shipping the default instead of it is a defect, not a simplification.

### Layer 1 — Reversibility (amended 2026-08-13)

Three mechanisms, in descending order of value:

1. A per-worktree temp-index checkpoint commit pinned under a dedicated ref namespace before any mutating tool call, capturing untracked and ignored content as well as tracked (see D6's mechanism correction and re-measurement). Per-action granularity. **Re-measured (M33-M36):** run at the affected worktree's own root, median 259 ms with occasional multi-hundred-millisecond spikes, of which roughly 220-250 ms is local `core.hooksPath` overhead rather than the mechanism itself; it scales with working-tree size, not diff size. Must run at each worktree's root, never at the superrepo root — the superrepo variant captures worktrees as empty gitlinks and misses their content entirely. `git add -A` against the fresh temporary index requires `--force`, or gitignored-but-tracked content is silently dropped because every path looks new to a fresh index.
2. `rm` rewritten to `/usr/bin/trash` through the hook's input-rewriting facility. A second line of defence over the same untracked and ignored content — `node_modules`, build output, `.env` — and the only one of the three that survives a checkpoint hook failing open. **Verified working (M29):** a hook-rewritten `rm` recovered the file intact from the Trash; the same command without the hook destroyed it. Because `~/.Trash` is TCC-protected, verification must `stat` the exact recovered path — listing the directory fails even when the file is there.
3. An hourly APFS local snapshot via launchd. The whole-volume backstop for anything the first two missed, including files outside any repository. **Verified working (M28):** `tmutil localsnapshot` succeeds with no Time Machine destination configured, no privilege prompt, in well under a second. macOS reports these snapshots as purgeable and subject to removal under disk pressure at any time — this layer is a best-effort backstop, not a guarantee.
4. An age-based reaper for items 1 and 3, running on a scheduler and never reachable from a tool call (required by D2). Without it this layer grows without bound and then fails silently under disk pressure.

**Precondition, made explicit 2026-08-13.** Layer 1 as a whole assumes free disk headroom; M4 established 982 GiB free at authoring time, but nothing in the design enforces a floor. A snapshot that cannot be created is indistinguishable from one that was silently thinned, so free space is a precondition this layer depends on, not a detail underneath it — the layer 4 heartbeat is amended below to assert it.

### Layer 2 — Rules (amended 2026-08-13)

Enumerated narrow `Bash` allow prefixes, not a single broad rule, plus a `deny` list holding only D1 through D5.

This ordering is not a preference. M13 establishes that a hook's `allow` cannot override a deny rule, so any deny entry that is not a catastrophe stalls the run no matter how good the gate is. The documentation prescribes exactly this shape: add `Bash` to the allow list and register a PreToolUse hook that rejects the specific commands you want blocked — a single broad rule is not required to satisfy that shape, and M25 shows it is actively worse in `auto` mode.

**Amended 2026-08-13.** This section originally specified a single broad `Bash` allow rule. M25 found that a broad `Bash(*)` allow is silently discarded in `auto` mode — falling through to the classifier it was meant to bypass — while narrow prefixes such as `Bash(chmod:*)` both execute and skip the classifier. Under `bypassPermissions` (section 5) allow rules are inert either way (M14), so this distinction has no effect on the unattended run itself; it matters because the same settings file also governs interactive sessions on the machine, which run in `auto` by default (M19), and a broad rule actively degrades those. Narrow enumeration is neutral where broad would be inert, and strictly better where broad would be harmful — it is the mode-robust choice.

`ask` rules are removed entirely from the unattended configuration. M14 establishes that an explicit `ask` prompts in every mode including `bypassPermissions`, which makes any surviving `ask` rule an unconditional overnight stall.

### Layer 3 — One gate

A single PreToolUse decision function returning `allow` or `block`, never `ask`. Predicates in evaluation order, cheapest and most decisive first:

| Order | Predicate | Approximate cost |
|---|---|---|
| P0 | Is this call catastrophe-relevant at all? | ~0 ms |
| P1 | Would this move credential-shaped data off the machine? (D1) | ~1 ms |
| P2 | Would this spend unbounded resources? | ~1 ms |
| P3 | Would this disable the recovery layer or the gate? (D2) | ~1 ms |
| P4 | Does the target resolve outside the repo and its worktrees? | 39 ms once, cached thereafter |
| P5 | Does this reach remote, shared or published state? (D3, D4, D5) | ~1 ms |
| P6 | Does an intact recovery copy exist right now? (D6) | 90 ms, reached rarely |

P0 through P3 clear more than 95 percent of calls in about 2 ms, against the 145 ms measured today (M11). P6 is the expensive check and is last precisely because it is the only one that buys what no permission rule can express: that `reset --hard` on a clean tree is harmless.

**Failure policy.** Fail open by default; fail closed only for P1, P2 and P5 — the predicates where no recovery copy can exist. Justification: the platform already fails open on hook timeout, so a fail-closed design would be inconsistent rather than strict; and under unattended operation a fail-closed bug costs an entire night while a fail-open bug costs one operation that D6 has already checkpointed.

**Consolidation.** One gate, not several. The predicates share expensive state (repository root, worktree set, dirty status) that separate processes would each recompute; every additional script pays 22 to 32 ms of interpreter startup on every matching call; and the checkpoint-versus-block precedence must be decided in one place. Observer hooks that only log or annotate stay separate and must never gate.

### Layer 4 — Observability (amended 2026-08-13)

Three obligations, all non-optional:

1. An append-only audit log of every tool call, so that damage is diagnosable in the morning even where it was not preventable.
2. A `SessionStart` heartbeat that asserts layers 0 and 1 are alive — sandbox actually active, newest snapshot within the expected window, newest checkpoint ref within the session, promotion pointer current, and free disk headroom above a floor (added 2026-08-13; a snapshot that cannot be created is indistinguishable from one that was thinned) — and refuses to begin an unattended run if any assertion is stale.
3. **Added 2026-08-13.** A convergence assertion, distinct from the promotion-pointer check above: that live's `hooks` and `permissions.deny` are actually present and non-empty, and that live is converged with LOCAL `refs/heads/main` (M39) rather than merely with whatever `main` was at the last promotion. Neither self-destruct path in section 0.8 raises an error anywhere in the pipeline — `validate.mjs` finds no registrations to reject, so a `hooks`-stripped or `deny`-stripped release is syntactically valid and promotes cleanly (M31, M38). Only an assertion that checks for the keys' presence and non-emptiness, run as part of this heartbeat, catches it. This does not extend to whether the gate's logic is correct: M31 established that no stage of this pipeline executes hook logic, syntax-checking is the ceiling, and a behaviorally wrong gate that is present passes both validation and this heartbeat.

The heartbeat obligations exist because a reversibility or gating layer that silently stops, or silently empties, is worse than none: it manufactures confidence. macOS thins APFS snapshots under disk pressure without notification, a broken checkpoint hook fails open by design, and a config-pipeline promotion can delete the gate itself while reporting success (section 0.8, section 10).

## 5. Run mode (amended 2026-08-13)

Adopt `bypassPermissions` as an argv flag on the unattended invocation — `--permission-mode bypassPermissions` — never as a settings key.

M30 found that `defaultMode: "bypassPermissions"` in project settings IS honored, unlike `auto`, which M19 restricts to user settings, managed settings or `--settings`. That would have worked. It is superseded anyway: `claude --help` documents `--permission-mode <mode>` as a first-class flag accepting `bypassPermissions`, and argv is the correct delivery mechanism because a settings-file mode applies to every session on the machine, including interactive ones, while an argv flag applies to exactly one invocation and cannot leak beyond it. A settings key would make every interactive session on the machine run under `bypassPermissions` by default; the flag confines the loss of the classifier to the sessions that are actually unattended.

**M17 is refuted for this delivery path.** The original claim — that `bypassPermissions` requires a one-time interactive acceptance dialog, and that a background session is refused until that dialog is accepted in a prior interactive session — does not hold for `claude -p --permission-mode bypassPermissions`. Measured 2026-08-13 (M32): `init.permissionMode` reported `bypassPermissions`; a write outside the working directory, one `default` mode blocks at the workspace write boundary, succeeded; `permission_denials` was 0; exit code 0; stderr empty; no acceptance dialog appeared; and `--allow-dangerously-skip-permissions` was not required — the mode flag alone sufficed. This was measured only on the non-interactive `-p` argv path; an interactive TTY session, a `--bg` session, and a cloud session were not tested, and the refutation must not be generalized to them.

The reasoning is not that it is safest. It is that M16 makes auto mode incompatible with the stated goal: in a non-interactive run, auto mode does not stall — it silently drops the blocked action and reports a completed run. The requirement is not "no stalls", it is "all tasks complete", and a silent skip fails that requirement invisibly, which is strictly worse than a visible stall.

Under `bypassPermissions` the guard set is fully preserved: M14 keeps `deny` rules enforced and M15 keeps hook blocks enforced. What is given up is the classifier — the intent-aware layer that reads what the agent is actually trying to do. Deny rules and hook predicates are deterministic but blind to intent. **This is the real and unavoidable cost of the design, and it is the single thing most worth objecting to.**

Consequence for layer 2: M18 means protected-path writes are auto-approved only under this mode, which is what makes editing `.claude/` viable unattended.

## 6. Ordered change set

Step zero is not optional and is not intuitive.

**Step 0 — clear the guard that blocks this work.** `protect-claude-config.sh` asks on any edit under `.claude/{hooks,rules,lib,workflows}`. Those paths are the entire content of this repository and the entire surface of this SPEC's implementation. The redesign stalls on itself unless this is narrowed first, to the gate implementation and the deny list only, and converted from `ask` to `deny` (a narrow deterministic block, not a prompt).

**Step 1 — prune `deny`.** Remove every entry that is not D1 through D5. Deny survives every mode and every hook decision, so this is the highest-leverage single change. **Caution added 2026-08-13:** `permissions.deny` is a repo-owned key in the promotion manifest (M37) — the repo's declared list fully replaces live's on every promotion, and an omission of the key entirely, in some later revision, deletes it from live rather than leaving it unchanged (M38). Pruning `deny` down to D1-D5 now is exactly the edit this pipeline is built to carry correctly; the hazard is a later change that drops the key by accident, not this step.

**Step 2 — retire `ask`.** Remove `ask` rules from the unattended configuration and convert the existing hook `ask` branches to checkpoint-and-allow (D6) or block (D1-D5).

**Step 3 — enumerated narrow `Bash` prefixes**, plus `mcp__*` coverage. M10 shows MCP calls currently have no allow headroom at all. **Inverted 2026-08-13.** M25 found that a broad `Bash(*)` allow rule is silently discarded in `auto` mode — the debug log records `Ignoring dangerous permission Bash(*) ... (bypasses classifier)`, and the command falls through to the classifier and is blocked, with the rejection visible only at debug level, never in the transcript. A narrow rule such as `Bash(chmod:*)` both executes and skips the classifier entirely. This step is therefore enumerated narrow prefixes, not a single broad rule; section 4 Layer 2 is amended to match.

**Step 4 — reset `settings.local.json`.** M9 shows it is a friction log that never reduces future friction. Truncate to the reusable prefix rules and stop the accumulation at its source.

**Step 5 — layer 1 reversibility**, then **step 6 — the gate**, then **step 7 — layer 4 observability**.

**Step 8 — delete what is inert or harmful.** `block-env-edits.sh` (exits 1, non-blocking, therefore inert while printing "BLOCKED"); `pre-commit-scoped-verify.sh` (blocks commits, and a commit is the recovery mechanism); `ui-ux-audit-on-edit.sh` (unbounded `npx` network fetch on every UI edit). `session-config-drift-check.sh` is registered to no event and is dead code; either wire it into the layer 4 heartbeat or remove it.

**Step 9 — resolve the third-party fail-closed risk.** The logbook plugin's guard denies the entire Bash, Write, Edit, MultiEdit and NotebookEdit surface on any internal exception, with no circuit breaker. This is the worst overnight-freeze risk identified and it lives in a plugin rather than in this configuration.

**Mechanism found 2026-08-13 (M42-M44).** A `--settings` profile scoped to the unattended invocation — `{"enabledPlugins":{"logbook@logbook":false}}` — disables exactly this plugin: verified, plugin count 15 to 14, its MCP server gone, hook counts down by exactly one on every event, the other six plugins and their hooks otherwise untouched. This is a session-scoped disable, not a global one, which matters because a global disable was never acceptable given the plugin's active interactive use for continuity-ledger work. `enabledPlugins` is live-owned in the promotion manifest (M37), so a repository declaration of it — including the repository's own second alias, `logbook@continuity-ledger` — is never applied; only this argv-delivered, session-scoped override reaches live. This is the second reliance this SPEC now has on the `--settings`/`--permission-mode` argv channel (section 5); M42 and M43 in section 0.8 cover what does, and does not, govern that channel.

## 7. Ratified decisions

All six were ratified by the user on 2026-08-13.

| # | Decision | Status |
|---|---|---|
| R1 | The guard set is exactly D1-D5, with D6 as checkpoint | RATIFIED 2026-08-13 |
| R2 | Run mode is `bypassPermissions`, accepting the loss of the classifier | RATIFIED 2026-08-13 |
| R3 | Lift the standing prohibition on `--dangerously-skip-permissions`, replacing it with a rule requiring layers 0, 1 and 4 to be live first | RATIFIED 2026-08-13 |
| R4 | `ask` rules are prohibited in the unattended configuration | RATIFIED 2026-08-13 |
| R5 | Force-push to a branch another party consumes is guarded; to a personal branch it is not | RATIFIED 2026-08-13 |
| R6 | The logbook plugin guard is disabled or patched before the first unattended run | RATIFIED 2026-08-13 |

R3 carries a precondition that is part of the ratification, not advice: the prohibition is lifted only for a configuration in which layers 0, 1 and 4 are live and the layer 4 heartbeat asserts them at session start. `bypassPermissions` without the reversibility layer beneath it is not the design ratified here.

R1 is ratified as amended. The guard set is unchanged in membership; D1, D2 and D4 carry the section 11 amendments, and D6 carries the mechanism correction.

R2 is ratified as implemented via argv, not a settings key. The mode ratified — `bypassPermissions`, accepting the loss of the classifier — is unchanged; section 5 now delivers it as `--permission-mode bypassPermissions` on the unattended invocation rather than a `defaultMode` settings entry, because M30 and M32 (section 0.6) show argv is both sufficient and scoped to one invocation where a settings key would apply machine-wide.

R6 is ratified as implemented via a mechanism found 2026-08-13, not as originally scoped. A `--settings` profile disabling only `logbook@logbook` for the unattended invocation — `{"enabledPlugins":{"logbook@logbook":false}}` — satisfies R6 without a global disable, which was never acceptable given the plugin's active use for continuity-ledger work in interactive sessions (M44, section 6 step 9). The ratification is unchanged; the mechanism is now argv-scoped rather than machine-wide.

Rules ruled on 2026-08-13 and not reopened here: no-direct-DB-access keeps unchanged; centralized PR creation keeps unchanged; destructive-git confirmation narrows to D2 and D6.

## 8. Resolved, 2026-08-13 (Wave 0)

Every claim below has been settled by the experiment that was going to settle it. None remains a precondition on section 6; each verdict is now load-bearing in the section named in the right-hand column.

| # | Claim | Verdict | Where it landed |
|---|---|---|---|
| U1 | Whether a hook's `allow` suppresses the auto-mode classifier, as distinct from the interactive prompt | VERIFIED. It suppresses the classifier itself, confirmed by paired control (M24) | Layer 3's gate design depends on this |
| U2 | Whether a dropped auto-mode allow rule becomes a block or falls through to the classifier | REFUTED the assumption of no penalty. A broad rule is silently discarded and falls through to the classifier; a narrow rule both executes and skips it (M25) | Section 6 step 3; section 4 Layer 2 |
| U3 | Whether the sandbox permits localhost by default | REFUTED, then RESOLVED. Loopback is blocked by default; the fix is a specific key set, not a single flag (M26-M27) | Section 4 Layer 0 |
| U4 | Whether `tmutil localsnapshot` succeeds with no Time Machine destination configured, and without a privilege prompt | VERIFIED (M28) | Section 4 Layer 1 |
| U5 | Whether the hook input-rewriting facility actually rewrites a Bash command in the installed version | VERIFIED, with a verification-method trap (M29) | Section 4 Layer 1 |
| U6 | Whether `bypassPermissions` is honored from project settings, or ignored the way `auto` explicitly is | VERIFIED honored, then SUPERSEDED by a better mechanism (M30) | Section 5 |
| U7 | `validate.mjs`'s rejection criteria, since a rejected promotion silently no-ops a config change (M7) | ANSWERED: ten distinct syntax-level checks; it never executes hook logic (M31) | Section 0.8; section 4 Layer 4; section 10 |

Two further findings arrived in the same wave, outside this table because neither was one of U1-U7. M17 (section 0.4) is REFUTED for the non-interactive `-p --permission-mode` argv path (M32; section 5). The D6 checkpoint mechanism this SPEC had already corrected once required a second correction after measurement — the superrepo variant is disqualified and the per-worktree, `--force`d form is what section 2 and section 4 Layer 1 now specify (M33-M36).

## 9. Non-goals

- Auditing the contents of the hook scripts for correctness beyond their block/ask/inert classification.
- Any change to the PR creation contract or the database access rule.
- Container or VM isolation. M3 makes it unavailable today, and layers 0 and 1 reach the goal without it.
- Making the agent safe against a deliberately adversarial model. This design assumes an agent that is trying to do the task, and defends against accidents and prompt injection, not against intent.

## 10. How this fails

| Failure | Why it is silent | Detection |
|---|---|---|
| Snapshots stop being created or are thinned early | macOS deletes snapshots under disk pressure without notification | Layer 4 heartbeat asserts a snapshot newer than the expected window |
| Checkpoint refs stop advancing | A broken hook fails open by design | Heartbeat asserts a checkpoint ref within the session |
| Sandbox silently inactive | Documented behavior is to warn and run unsandboxed | `failIfUnavailable`, plus a heartbeat assertion |
| A config change never goes live | A rejected promotion leaves the last-good release in place (M7) | Heartbeat compares the promotion pointer against HEAD |
| The gate blocks something ordinary | Under fail-open it will not; under the fail-closed subset it will abort the task | Audit log, reviewed the next morning |
| The classifier's absence lets an intent-level mistake through | Nothing detects it at the time | Accepted risk of R2. This is the design's known weak point |
| A pull request that omits `hooks` or `permissions.deny` strips it from live, including the gate itself | Both are repo-owned keys (M37); an absent key is deleted from live (M38), and `validate.mjs` finds nothing to reject when there are no registrations (M31) | The Layer 4 convergence assertion checks presence and non-emptiness (section 4 Layer 4) |
| Sandboxed loopback is denied and silently re-run unsandboxed | `allowUnsandboxedCommands` defaults to permitting the fallback, and the fallback reports success (M26) | `allowUnsandboxedCommands: false` plus `failIfUnavailable: true` (section 4 Layer 0, M27) |
| A merged pull request never reaches the running agent | `converge.mjs` reconciles only against LOCAL `refs/heads/main`; a GitHub merge does not by itself advance the local pointer (M39) | A human must advance local `main`; nothing today surfaces the gap on its own |
| A rolled-back release reappears | `converge.mjs` promotes whenever live differs from local `main`; a pointer rollback that does not also move the `main` ref is re-promoted at the next `SessionStart` or `Stop` (M40) | A human must move the `main` pointer back at the same time as the pointer rollback; nothing currently enforces this |
| A syntactically valid but behaviorally wrong gate goes live | `validate.mjs` is a syntax gate only; it never executes hook logic (M31) | None today; accepted risk alongside the classifier's absence above |
| `--settings` injects or overrides permission rules outside the promotion pipeline | Nothing in the pipeline — PR, review, merge, validate, promote — governs argv, and `--settings` deep-merges rather than replacing, so an injected profile composes silently with whatever else is already in force (M42-M43) | The unattended launcher itself must be the governed artifact; not yet built |
| A direct `promote.mjs` invocation puts a non-`main` ref live | The main-only refusal is enforced by `converge.mjs`'s wrapper logic, not by `promote.mjs` itself — its CLI accepts an arbitrary `--ref` with no restriction (M41) | Nothing today; any direct caller of `promote.mjs` must be trusted to pass `main` |

## 11. Pressure test, 2026-08-13

Each guard was attacked from the maximum-autonomy position: is this a genuine catastrophe, or a stall in disguise? Three of six require amendment before ratification. The amendments are recorded here rather than folded silently into sections 2 and 4, so that what changed and why stays legible.

| Guard | Objection | Outcome |
|---|---|---|
| D1 | Secret detection is false-positive-prone, and blocking a *write* is not the same as blocking *exfiltration* | **Amend.** The rationale is disclosure, but the mechanism in place today gates writes. D1 must gate outbound movement — credential reads plus network egress — with the write-side scanner kept as separate hygiene, not as D1's implementation |
| D2 | Circular: if the agent may not touch the recovery layer, nothing may prune it. Checkpoint refs and snapshots accumulate without bound and no maintenance path exists | **Amend.** Real hole. Requires an age-based reaper running outside the agent's reach — never an agent-invoked prune. Without it, layer 1 fills the disk and macOS begins thinning snapshots silently, which is failure mode one in section 10 |
| D3 | The agent cannot validate a migration it wrote, so the overnight run completes with the riskiest artifact unverified — the silent-incompleteness failure this design exists to prevent | **Survives.** Answered by the existing carve-out permitting local disposable containers for tests, ratified 2026-07-06. Section 4 should name that carve-out explicitly so the gate does not over-match |
| D4 | Over-broad. Creating an issue or commenting on a pull request reaches a third party but is deletable and is routine workflow | **Amend, narrow.** D4 covers only actions with no retraction mechanism that reach parties outside the user's own accounts: email, package publish, payments, non-idempotent third-party calls. Issue and PR comments on the user's own repositories are ungated |
| D5 | The primary repository is already public, so the guard has no target in the current environment | **Survives on cost, not on demonstrated need.** A deny line that may never fire and costs nothing. Retained as insurance for future private repositories; honest framing is that it buys little today |
| D6 | `git stash create` cannot capture untracked files, yet untracked work is precisely the class with no recovery window (M23). The mechanism does not cover its own stated case | **Classification survives, mechanism rejected.** The 19 ms figure belongs to a mechanism that does not do the job. A temp-index checkpoint — stage into a temporary index, write-tree, commit-tree, pin the ref — is required, and it costs more than 19 ms. Re-measure before relying on the latency budget in section 4 |

Two conclusions follow. First, the guard *set* is sound: no guard was found unnecessary, and none was found missing. Second, two of the mechanisms chosen to implement it were wrong in ways that would have shipped a guard that does not guard — D1 watching the wrong surface, D6 unable to capture the class it exists for. Both were caught by asking what the mechanism actually covers rather than what it is named after, which is the same failure mode section 1 rejects for command names.
