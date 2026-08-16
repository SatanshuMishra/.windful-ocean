# Maximum-autonomy permission architecture — Wave 0 findings (U1-U7)

Companion evidence record for `2026-08-13-maximum-autonomy-permission-architecture-SPEC.md`. Every finding below was measured on 2026-08-13 against Claude Code 2.1.231 on macOS 26.5.1, by the probe wave the SPEC's section 8 dispatched to settle U1 through U7. Two further items — the D6 checkpoint mechanism the SPEC had already corrected once, and three additional probes that landed after the original dispatch — are recorded here in the same wave, because they carry the same evidentiary weight and the SPEC now cites them.

This document is the durable record: claim, method, raw observation, verdict, and consequence, per item. The SPEC carries the terse, dated M-fact and the resulting section amendments; this document carries the full method and observation behind each one. Where a finding is scoped to a specific path or condition, that scope is stated explicitly and must not be read more broadly than tested.

## Summary

| Item | Verdict | One line |
|---|---|---|
| U1 | VERIFIED | A hook `allow` suppresses the auto-mode classifier itself, not just the interactive prompt |
| U2 | REFUTED | A broad `Bash(*)` allow is silently discarded in auto mode and falls through to the classifier; a narrow rule is not |
| U3 | REFUTED, then RESOLVED | The sandbox blocks loopback by default and silently degrades to unsandboxed on denial; a four-key configuration fixes both |
| U4 | VERIFIED | `tmutil localsnapshot` works with no destination configured, but the result is purgeable |
| U5 | VERIFIED | Hook `updatedInput` rewriting works; verifying it has a TCC-protected directory-listing trap |
| U6 | VERIFIED, then superseded | `bypassPermissions` is honored from project settings, but a CLI flag is the better delivery mechanism |
| U7 | ANSWERED | `validate.mjs` runs ten syntax-level checks and never executes hook logic |
| D6 (re-measurement) | Superrepo variant disqualified; worktree-root variant confirmed | Per-worktree `--force`d temp-index checkpoint, ~259 ms median, ~220-250 ms of which is local hook overhead |
| M17 (existing SPEC fact) | REFUTED for the non-interactive argv path | `--permission-mode bypassPermissions` needs no acceptance dialog and no `--allow-dangerously-skip-permissions` |
| `--settings` merge behavior | New finding | Deep-merges object-valued keys per inner key; does not replace wholesale |
| `--settings` plugin scoping | New finding | Can disable one plugin for one invocation without a global, machine-wide disable |

## U1 — VERIFIED

**Claim.** A PreToolUse hook returning `allow` suppresses the auto-mode classifier itself, not merely the interactive confirmation prompt.

**Method.** Paired control: the same `chmod 777` command, run in the same auto mode, differing only by whether a PreToolUse hook returning `allow` for that command was registered.

**Raw observation.** Without the hook: the file was unchanged, and the debug log recorded a classifier block. With the hook: the file changed, and the classifier was never invoked.

**Verdict.** VERIFIED.

**Consequence for the SPEC.** Layer 3's single-gate design (section 4) depends on a hook `allow` decision genuinely bypassing the classifier, not merely skipping a prompt a non-interactive run would have skipped anyway. Recorded as M24 (SPEC section 0.6).

## U2 — REFUTED, and it inverts a step of the SPEC

**Claim under test.** Whether a dropped auto-mode allow rule becomes a block, or falls through to the classifier — i.e., whether a broad `Bash(*)` allow rule costs anything relative to enumerating narrow prefixes.

**Method.** Configure only a broad `Bash(*)` allow rule, enter auto mode, run a non-read-only command, and observe the path taken via the debug log. Repeat with a narrow rule (`Bash(chmod:*)`) for comparison. Repeat the broad rule in `default` mode for contrast.

**Raw observation.** With the broad rule in auto mode, the debug log recorded `Ignoring dangerous permission Bash(*) ... (bypasses classifier)`, and the command fell through to the classifier and was blocked — a rejection visible only at debug level, never surfaced in the transcript. With the narrow rule, the command both executed and skipped the classifier entirely. In `default` mode, `Bash(*)` was honored normally.

**Verdict.** REFUTED. A broad allow rule is not merely no better than narrow enumeration in auto mode — it is actively worse, producing a classifier block that a narrow rule avoids.

**Consequence for the SPEC.** Section 6 step 3 ("broad `Bash` allow") as originally written produces strictly less autonomy under auto mode than enumerating narrow prefixes. The rejection is invisible at the transcript level, so this would have shipped as a silent regression. Step 3 is inverted to enumerated narrow prefixes; section 4 Layer 2's architecture statement is amended to match. Recorded as M25 (SPEC section 0.6).

## U3 — REFUTED, then RESOLVED (Layer 0 survives, amended)

**Claim under test.** Whether the sandbox permits localhost by default.

**Method (block).** Enable the sandbox with no allowed domains configured; probe a local dev server on loopback. Separately, observe what happens to a command the sandbox denies under the default `sandbox.allowUnsandboxedCommands` setting.

**Raw observation (block).** The sandbox blocks loopback by default. `NO_PROXY` contains `localhost,127.0.0.1,::1`, so loopback traffic bypasses the proxy that implements the domain allowlist and is denied at the network layer with EPERM. Adding `localhost` to `allowedDomains` does not help, because the allowlist is structurally unreachable for loopback traffic — the proxy that enforces it is never in the path. Separately, under the default `allowUnsandboxedCommands`, a command the sandbox denies is silently re-run fully unsandboxed and reported as succeeded.

**Method (resolution).** Assemble and verify a candidate key set together, in a single configuration.

**Raw observation (resolution).** Configuration verified: `sandbox.enabled: true`, `sandbox.allowUnsandboxedCommands: false`, `sandbox.failIfUnavailable: true`, `sandbox.network.allowLocalBinding: true`. Under it: loopback connects and returns 200; writes inside cwd succeed; writes to `$HOME` and into the repository are denied with EPERM; `~/.ssh` reads are denied; external HTTPS still returns 403 from the allowlist proxy; the sandboxed process carries `SANDBOX_RUNTIME=1`. `allowLocalBinding` was isolated as the single causal key that unblocks loopback without opening anything else.

**Schema, recorded in full.** `sandbox.filesystem.{disabled, allowRead, denyRead, allowWrite, denyWrite, readOnly}` and `sandbox.network.{allowedDomains, deniedDomains, allowLocalBinding, allowUnixSockets, allowAllUnixSockets, allowMachLookup, excludedCommands}`. There is no `network.disabled` key.

**Verdict.** REFUTED as originally assumed — the sandbox does not permit localhost by default, and the failure compounds with a silent unsandboxed fallback on denial — then RESOLVED: a four-key configuration restores loopback without giving up containment, verified holding filesystem containment, working localhost, and allowlisted egress simultaneously.

**Consequence for the SPEC.** Layer 0 is NOT dropped; it is amended with the required key set. The default configuration — `sandbox.enabled: true` alone, as section 4 Layer 0 originally specified — must be documented as unsafe, because its containment is illusory: a locally running dev server cannot be probed, and a denied command silently escapes containment while reporting success. Recorded as M26 (the block) and M27 (the fix) in SPEC section 0.6.

## U4 — VERIFIED

**Claim.** `tmutil localsnapshot` succeeds with no Time Machine destination configured, and without a privilege prompt.

**Method.** Run it; check `listlocalsnapshotdates` for a dated entry.

**Raw observation.** Exit 0 in 0.322 s, no privilege prompt. macOS warns that local snapshots are purgeable and may be removed at any time.

**Verdict.** VERIFIED.

**Consequence for the SPEC.** Layer 1's snapshot mechanism (item 3) is confirmed operative with no setup beyond invoking it. The purgeable warning means it must be documented as a best-effort backstop, not a guarantee, and free-space headroom is added to section 4 Layer 1 as an explicit precondition — a snapshot that cannot be created is indistinguishable from one that was silently thinned. Recorded as M28 (SPEC section 0.6).

## U5 — VERIFIED

**Claim.** The hook input-rewriting facility (`updatedInput`) actually rewrites a Bash command in the installed version.

**Method.** Register a PreToolUse hook that rewrites `rm <file>` to `/usr/bin/trash <file>`. Run the command with the hook active and again without it. Check whether the file lands in, and can be recovered from, the Trash.

**Raw observation.** With the hook: the file was recovered intact from the Trash. Without it: the same command destroyed the file. A verification-method trap was found in the process: `~/.Trash` is TCC-protected, so listing the directory fails even when the file is present, while `stat` on the exact recovered path succeeds.

**Verdict.** VERIFIED.

**Consequence for the SPEC.** Layer 1's `rm`-to-`trash` rewrite (item 2) is confirmed working end to end. The verification trap is recorded so that a future heartbeat or audit check verifies by `stat`-ing the known path, never by listing the Trash directory, or it will falsely report the safeguard absent. Recorded as M29 (SPEC section 0.6).

## U6 — VERIFIED, then superseded by a better mechanism

**Claim under test.** Whether `bypassPermissions` is honored from project settings, or ignored the way `auto` explicitly is (M19).

**Method.** Set `defaultMode: "bypassPermissions"` in a scratch repository's project settings; observe the effective permission mode.

**Raw observation.** It IS honored. `bypassPermissions` does not share `auto`'s restriction to user settings, managed settings, or `--settings`.

**Verdict.** VERIFIED (honored), then SUPERSEDED in practice: `claude --help` documents a first-class CLI flag, `--permission-mode <mode>`, accepting `bypassPermissions`.

**Consequence for the SPEC.** The settings-key path would have worked, but argv is adopted instead: a settings-file mode applies to every session on the machine, including interactive ones, and cannot be un-leaked from them; an argv flag applies to exactly one invocation. Section 5 adopts `--permission-mode bypassPermissions` on the unattended invocation specifically. Recorded as M30 (SPEC section 0.6).

## U7 — ANSWERED

**Claim under test.** `validate.mjs`'s rejection criteria, since a rejected promotion silently no-ops a config change (M7).

**Method.** Read `validate.mjs` directly.

**Raw observation.** It rejects on ten distinct checks: missing or empty expected entries, hook path resolution failure, hook containment escape, non-regular hook target, non-executable hook invoked bare, undeterminable hook language, hook syntax check failure, unparseable JSON anywhere in the tree, symlink escape from the release, and bootstrap tools resolving inside `releases/`.

**Verdict.** ANSWERED, with a critical limitation attached: it is a SYNTAX gate only. It never executes hook logic.

**Consequence for the SPEC.** A behaviorally wrong permission gate — syntactically valid but doing the wrong thing, or nothing — passes validation and promotes to live undetected. This is recorded as a new accepted risk alongside the classifier's absence (section 10), and it is the reason the new Layer 4 convergence assertion checks presence and non-emptiness of `hooks` and `permissions.deny` — that assertion still cannot check gate logic, only gate existence. Recorded as M31 (SPEC section 0.6).

## D6 mechanism — re-measured

The SPEC had already rejected `git stash create` as D6's checkpoint mechanism (it cannot capture untracked files) and proposed a temp-index form — `add -A`, `write-tree`, `commit-tree`, pin the ref — without measuring its latency or settling where in a multi-worktree layout it should run. Wave 0 measured it.

**Claim under test.** What the temp-index checkpoint mechanism actually costs, and whether it should run at the superrepo root or at each worktree's own root.

**Method and raw observation — root placement.**

| Variant | Root | Result | Median latency |
|---|---|---|---|
| Superrepo | The repository root, with `.claude/worktrees/*` present as nested repositories | The eight worktrees under `.claude/worktrees/` — holding the actual parallel agent work D6 exists to protect — are captured as empty gitlinks. Their content is captured NOT AT ALL | 795 ms |
| Worktree | Each worktree's own root | That worktree's real content is captured: 1,731 blobs, 31.3 MiB, zero gitlinks | 259 ms |

**Method and raw observation — `--force` requirement.**

| Test | Result |
|---|---|
| `git add -A` (no `--force`) against a fresh temporary index, with a tracked-but-gitignored file present | File silently dropped — every path looks new to a fresh index, so ignore rules apply as if it were untracked |
| `git add -A --force` against the same fresh temporary index, same file | File captured |
| Untracked-file capture | Confirmed, on the same controlled scratch repository |

**Method and raw observation — latency decomposition.**

| Component of the 259 ms worktree-root median | Approximate share |
|---|---|
| This repository's own no-op `core.hooksPath` shim chain (`reference-transaction`, `post-index-change` hooks fired on every index write) | ~220-250 ms |
| Remainder — the mechanism itself, still under this repo's hook chain | Not isolated directly; likely low tens of milliseconds by subtraction |

**Verdict.** The superrepo variant is DISQUALIFIED — it misses the exact content class (worktrees) D6 exists to protect. The worktree-root variant, run with `--force`, is CONFIRMED as the required mechanism. The M12 figure of 19 ms, which belonged to the already-rejected `git stash create` mechanism, does not carry over to either variant.

**Consequence for the SPEC.** Section 2 D6 and section 4 Layer 1 now specify a per-worktree, `--force`d, temp-index checkpoint at roughly 259 ms median, with occasional multi-hundred-millisecond spikes, read as an upper bound measured under this repository's local hook overhead rather than as a mechanism-intrinsic cost. Recorded as M33 through M36 (SPEC section 0.7).

## Additional findings, same wave

These three did not settle a U-numbered question from section 8, but were produced by the same wave and are now cited by the SPEC. They are recorded here with the same rigor.

### M17 (existing SPEC fact) — REFUTED for the non-interactive argv path

**Claim under test.** The SPEC's existing M17: `bypassPermissions` requires a one-time interactive acceptance dialog on the machine, and a background session is refused until that dialog has been accepted in a prior interactive session.

**Method.** Run `claude -p --permission-mode bypassPermissions` in a scratch directory. Attempt a write outside the working directory — specifically one that `default` mode blocks at the workspace write boundary. Inspect `init.permissionMode`, `permission_denials`, exit code, and stderr.

**Raw observation.** `init.permissionMode` reported `bypassPermissions`. The out-of-workspace write succeeded. `permission_denials` was 0. Exit code was 0. Stderr was empty. No acceptance dialog appeared at any point. `--allow-dangerously-skip-permissions` was not required — the mode flag alone sufficed.

**Verdict.** REFUTED for this delivery path.

**Scope, stated explicitly.** Only the non-interactive `-p` argv path was tested. An interactive TTY session, a `--bg` session, and a cloud session were NOT tested. M17's original claim is preserved as written in the SPEC and stands unrefuted for those paths — this finding must not be generalized beyond the argv path it was measured on.

**Consequence for the SPEC.** Section 5's original text — adopting `bypassPermissions` "with the one-time acceptance dialog completed in an interactive session in advance" — no longer applies to the argv delivery path section 5 now specifies. M17 itself (SPEC section 0.4) is annotated in place with this refutation and its scope, rather than deleted, per the SPEC's own convention of keeping superseded reasoning legible (section 11's precedent). Recorded as M32 (SPEC section 0.6).

### The `--settings` channel deep-merges rather than replaces

**Claim under test.** How `--settings` inline JSON composes with settings already in force from other scopes.

**Method.** Pass a profile containing only `{"env":{"PROBE":"1"}}` via `--settings`. Inspect the resulting shell environment. Separately check whether an unrelated project-scope `permissions.deny` rule still fired.

**Raw observation.** The resulting shell environment contained BOTH the injected `PROBE` key and the other scope's pre-existing `env` entries. The unrelated project-scope `permissions.deny` rule still fired.

**Verdict.** VERIFIED. `--settings` performs a deep merge at command-line precedence — this refutes the naive reading that an object-valued key is replaced wholesale. Object-valued keys merge per inner key instead.

**Consequence for the SPEC.** The natural reading of the documentation — that most settings override, so an object-valued key like `env` or `enabledPlugins` is replaced entirely by a `--settings` profile that mentions it — is wrong. A design assuming wholesale replacement would produce a profile that silently drops everything it does not restate. This is the composition rule the scoped plugin-disable profile below relies on, and the rule any future unattended-launcher profile must be built against. Recorded as M43 (SPEC section 0.8).

### A `--settings` profile can disable a single plugin without restating the rest

**Claim under test.** Whether a plugin can be disabled for one invocation without a global, machine-wide disable.

**Method.** Pass `{"enabledPlugins":{"logbook@logbook":false}}` via `--settings`. Compare plugin count, MCP server presence, and per-event hook counts before and after.

**Raw observation.** Plugin count went from 15 to 14, with only the targeted plugin removed. Its MCP server disappeared. The other six plugins were untouched. Hook counts dropped by exactly one on every event.

**Verdict.** VERIFIED — a `--settings` profile scopes a plugin disable to the single invocation it is passed to.

**Related fact, found in the same probe.** The repository's own second alias for this plugin, `logbook@continuity-ledger`, appears only in the repository's settings. Because `enabledPlugins` is a live-owned key in the promotion manifest (SPEC M37), that repository declaration is never applied to live — live carries exactly one alias, `logbook@logbook`.

**Consequence for the SPEC.** Section 6 step 9 and R6 require the logbook plugin's fail-closed guard disabled before the first unattended run. A global disable was never acceptable, because the plugin is in active interactive use for continuity-ledger work. This finding supplies the mechanism that satisfies R6 without a global disable: an argv-delivered, session-scoped `--settings` profile, composing per the deep-merge rule above rather than replacing the rest of the configuration. Recorded as M44 (SPEC section 0.8).

## Scope note

The settings-ownership model (`manifest.mjs`), the promotion mechanism (`converge.mjs`, `promote.mjs`), and the ungoverned-argv-channel finding are grounded in this repository's own source rather than in a live probe with a claim/method/observation shape, so they are recorded directly in the SPEC (section 0.8, as M37 through M42) rather than duplicated here. This document's scope is the experimental record: U1 through U7, the D6 re-measurement, and the three probes above.
