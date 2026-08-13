# Maximum-autonomy permission architecture

Status: RATIFIED 2026-08-13, not implemented. Authored 2026-08-13.
R1 through R6 were ratified by the user on 2026-08-13, and the three guard amendments from the section 11 pressure test (D1, D2, D4) plus the D6 mechanism correction were applied at the same time. Sections 2 and 4 below carry the amended text; section 11 preserves the pre-amendment reasoning.
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
- **M17. `bypassPermissions` requires a one-time interactive acceptance dialog on the machine**, and a background session is refused until that dialog has been accepted in a prior interactive session. It also refuses to start as root outside a recognized sandbox. `[agent]`
- **M18. Protected paths (`.git`, `.claude`, `.env`-adjacent) are never auto-approved by allow rules in any mode except `bypassPermissions`.** The list is hardcoded, not configurable. `[agent]`
- **M19. `auto` mode, the `autoMode` block and `sandbox.network.strictAllowlist` are ignored when set in project or local settings.** They are honored only from `~/.claude/settings.json`, managed settings, or `--settings`. `[agent]`

### 0.5 The recovery windows that decide the guard set

- **M20. GitHub repository deletion is self-service recoverable for 90 days** — [docs.github.com](https://docs.github.com/en/repositories/creating-and-managing-repositories/restoring-a-deleted-repository). `[agent]`
- **M21. Git reflog defaults are 90 days reachable, 30 days unreachable, 2 weeks prune grace** — [git-gc](https://git-scm.com/docs/git-gc). `[agent]`
- **M22. Supabase's free tier ships with no automatic backups at all** — [supabase.com](https://supabase.com/docs/guides/platform/backups). A destructive query there has no undo. `[agent]`
- **M23. Uncommitted and untracked work has a zero-length recovery window.** `git reset --hard` and `git clean -fdx` destroy state that was never a git object, and M2 establishes there is no snapshot underneath. `[agent]`

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

### Layer 0 — Isolation

Enable the sandbox in `~/.claude/settings.json`, with `failIfUnavailable` set so a sandbox that cannot start is a loud failure rather than a silent downgrade to unsandboxed execution.

What it buys: writes outside the working directory become impossible at the OS level, enforced on child processes, rather than being merely disallowed by a rule that sees only a command string. An impossible action needs no gate.

What it does not cover: the Read, Edit and Write tools, which are governed by the permission system rather than the sandbox; and hooks and MCP servers, which run unconstrained on the host.

### Layer 1 — Reversibility

Three mechanisms, in descending order of value:

1. A temp-index checkpoint commit pinned under a dedicated ref namespace before any mutating tool call, capturing untracked and ignored content as well as tracked (see D6's mechanism correction). Per-action granularity. Latency to be re-measured; it scales with working-tree size.
2. `rm` rewritten to `/usr/bin/trash` through the hook's input-rewriting facility. A second line of defence over the same untracked and ignored content — `node_modules`, build output, `.env` — and the only one of the three that survives a checkpoint hook failing open.
3. An hourly APFS local snapshot via launchd. The whole-volume backstop for anything the first two missed, including files outside any repository.
4. An age-based reaper for items 1 and 3, running on a scheduler and never reachable from a tool call (required by D2). Without it this layer grows without bound and then fails silently under disk pressure.

### Layer 2 — Rules

A broad `Bash` allow rule, plus a `deny` list holding only D1 through D5.

This ordering is not a preference. M13 establishes that a hook's `allow` cannot override a deny rule, so any deny entry that is not a catastrophe stalls the run no matter how good the gate is. The documentation prescribes exactly this shape: add `Bash` to the allow list and register a PreToolUse hook that rejects the specific commands you want blocked.

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

### Layer 4 — Observability

Two obligations, both non-optional:

1. An append-only audit log of every tool call, so that damage is diagnosable in the morning even where it was not preventable.
2. A `SessionStart` heartbeat that asserts layers 0 and 1 are alive — sandbox actually active, newest snapshot within the expected window, newest checkpoint ref within the session, promotion pointer current — and refuses to begin an unattended run if any assertion is stale.

The second exists because a reversibility layer that silently stops is worse than none: it manufactures confidence. macOS thins APFS snapshots under disk pressure without notification, and a broken checkpoint hook fails open by design.

## 5. Run mode

Adopt `bypassPermissions`, with the one-time acceptance dialog completed in an interactive session in advance (M17).

The reasoning is not that it is safest. It is that M16 makes auto mode incompatible with the stated goal: in a non-interactive run, auto mode does not stall — it silently drops the blocked action and reports a completed run. The requirement is not "no stalls", it is "all tasks complete", and a silent skip fails that requirement invisibly, which is strictly worse than a visible stall.

Under `bypassPermissions` the guard set is fully preserved: M14 keeps `deny` rules enforced and M15 keeps hook blocks enforced. What is given up is the classifier — the intent-aware layer that reads what the agent is actually trying to do. Deny rules and hook predicates are deterministic but blind to intent. **This is the real and unavoidable cost of the design, and it is the single thing most worth objecting to.**

Consequence for layer 2: M18 means protected-path writes are auto-approved only under this mode, which is what makes editing `.claude/` viable unattended.

## 6. Ordered change set

Step zero is not optional and is not intuitive.

**Step 0 — clear the guard that blocks this work.** `protect-claude-config.sh` asks on any edit under `.claude/{hooks,rules,lib,workflows}`. Those paths are the entire content of this repository and the entire surface of this SPEC's implementation. The redesign stalls on itself unless this is narrowed first, to the gate implementation and the deny list only, and converted from `ask` to `deny` (a narrow deterministic block, not a prompt).

**Step 1 — prune `deny`.** Remove every entry that is not D1 through D5. Deny survives every mode and every hook decision, so this is the highest-leverage single change.

**Step 2 — retire `ask`.** Remove `ask` rules from the unattended configuration and convert the existing hook `ask` branches to checkpoint-and-allow (D6) or block (D1-D5).

**Step 3 — broad `Bash` allow**, plus `mcp__*` coverage. M10 shows MCP calls currently have no allow headroom at all.

**Step 4 — reset `settings.local.json`.** M9 shows it is a friction log that never reduces future friction. Truncate to the reusable prefix rules and stop the accumulation at its source.

**Step 5 — layer 1 reversibility**, then **step 6 — the gate**, then **step 7 — layer 4 observability**.

**Step 8 — delete what is inert or harmful.** `block-env-edits.sh` (exits 1, non-blocking, therefore inert while printing "BLOCKED"); `pre-commit-scoped-verify.sh` (blocks commits, and a commit is the recovery mechanism); `ui-ux-audit-on-edit.sh` (unbounded `npx` network fetch on every UI edit). `session-config-drift-check.sh` is registered to no event and is dead code; either wire it into the layer 4 heartbeat or remove it.

**Step 9 — resolve the third-party fail-closed risk.** The logbook plugin's guard denies the entire Bash, Write, Edit, MultiEdit and NotebookEdit surface on any internal exception, with no circuit breaker. This is the worst overnight-freeze risk identified and it lives in a plugin rather than in this configuration.

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

Rules ruled on 2026-08-13 and not reopened here: no-direct-DB-access keeps unchanged; centralized PR creation keeps unchanged; destructive-git confirmation narrows to D2 and D6.

## 8. Unverified, with the experiment that settles each

No step in section 6 that depends on one of these may be implemented before the corresponding test is run.

| # | Claim | Test |
|---|---|---|
| U1 | Whether a hook's `allow` suppresses the auto-mode classifier, as distinct from the interactive prompt | In auto mode, register a hook returning `allow` for a command the classifier blocks by default; observe whether it executes |
| U2 | Whether a dropped auto-mode allow rule becomes a block or falls through to the classifier | Configure only a broad `Bash(*)` allow, enter auto mode, run a non-read-only command, observe the path taken |
| U3 | Whether the sandbox permits localhost by default | Enable the sandbox with no allowed domains; probe a local dev server |
| U4 | Whether `tmutil localsnapshot` succeeds with no Time Machine destination configured, and without a privilege prompt | Run it; check `listlocalsnapshotdates` for a dated entry |
| U5 | Whether the hook input-rewriting facility actually rewrites a Bash command in the installed version | Rewrite `rm x` to `trash x`; confirm the file lands in the Trash |
| U6 | Whether `bypassPermissions` is honored from project settings, or ignored the way `auto` explicitly is | Set it in a scratch repository's project settings; observe the effective mode |
| U7 | `validate.mjs`'s rejection criteria, since a rejected promotion silently no-ops a config change (M7) | Read it, or make an intentionally invalid change and observe the next promotion |

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
