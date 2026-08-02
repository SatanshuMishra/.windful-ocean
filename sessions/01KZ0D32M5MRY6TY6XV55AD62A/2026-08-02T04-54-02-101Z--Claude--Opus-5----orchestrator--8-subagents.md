READ-ONLY AUDIT SESSION. No config file was modified. Nothing was ratified by the user.

DURABLE FINDINGS (full detail, all citations): .claude/reports/2026-08-01-permission-config-audit.md
That directory is gitignored (.gitignore:10) and the file is leak-clean (no confidential codename).

=== WHAT WAS DONE ===
Two research rounds, eight subagents, auditing .claude/settings.json + .claude/settings.local.json
under `auto` permission mode. Round 1 audited the DENY side (what is blocked). Round 2 was prompted
by the user catching a gap: the deny-side framing never asked which ALLOW rules actually hold in
auto mode. Round 2 audited the allow side.

=== THE PRINCIPLE (established, NOT ratified) ===
Gate on whether an intact copy of prior state survives somewhere the agent did not just touch, and
on whether effects escape this repo into shared/production state. Never gate on the command name.
Command names are a lossy proxy: `rm -rf ./build` and `rm -rf ~/Documents` are the same string shape
and opposite risks; `git reset --hard` is a no-op on a clean tree and unrecoverable on a dirty one.

=== THE MECHANISM CONSTRAINT (drives all implementation) ===
The tiers implied by that principle are STATE-dependent ("reset --hard on a CLEAN tree"). Claude Code
permission rules are PREFIX MATCHERS with zero runtime state awareness. So most of the line cannot be
drawn in settings.json at all. Three mechanisms, assign each boundary to the one that can see it:
  deny/ask rule -> deterministic, prefix-only, no state. For things wrong regardless of state.
  PreToolUse hook -> deterministic, CAN shell out and inspect live state (git status/ls-files).
                     For the dirty-tree, path-escapes-repo, local-vs-remote checks.
  auto-mode classifier -> sees intent + transcript, probabilistic, SOFT (clears on stated intent).
                     For intent-dependent judgments no rule can encode.

=== FOUR P0 BUGS (unambiguous; need no pending decision) ===
1. .claude/hooks/block-env-edits.sh:27 exits 1. Only exit 2 blocks a tool call; exit 1 is a
   non-blocking error and the call PROCEEDS. The .env write guard is INERT today. The file's own
   header comment asserts the opposite. One-character fix.
2. settings.json:40-42 default-branch push denies are literal prefixes. They miss
   `git push -u origin main` and `git push origin HEAD:main`. Compounding this, Claude Code v2.1.211
   REMOVED the classifier's default block on default-branch pushes ("Pushing to any branch of the
   repository you're working in, including the default branch" is now ALLOWED). Both gates fail at once.
3. settings.json:46 denies `supabase db reset`, contradicting the ratified 2026-07-06 exception at
   .claude/rules/common/no-direct-db-access.md:54, which explicitly PERMITS it against a throwaway
   local container. The scope guard at :56 re-lists prohibited commands and deliberately OMITS
   db reset. The deny blocks work already approved.
4. settings.json:43 `gh pr review` is an ORPHAN deny. Exhaustive grep across .claude/rules and
   docs/superpowers/specs returned zero justification.

=== ROUND 1: DENY-SIDE STRUCTURE ===
Auto mode decision order: (1) allow/ask/deny rules resolve immediately, (2) read-only actions AND
working-dir file edits auto-approved, (3) everything else -> classifier.
CONSEQUENCE: READS NEVER REACH THE CLASSIFIER. Every Read() deny is the SOLE gate on that path.
`claude auto-mode defaults` returns allow(17), soft_deny(65), hard_deny(1). The single hard deny is
Data Exfiltration. Every other classifier block is SOFT and clears when the user states intent.
So a deny rule's real job in auto mode is converting a soft, arguable block into an unconditional one.
The classifier ALLOWS by default: read-only HTTP, reading .env, creating PRs, pushing to any branch.
Those four denies are therefore LOAD-BEARING, not redundant. (This refuted the orchestrator's initial
hypothesis that most denies were redundant.)
Genuinely redundant (classifier already blocks; deny only upgrades soft->hard): git push --force,
git reset --hard.
POLICY not safety (keep regardless): gh pr create/merge, MCP PR denies, remote supabase.
The MCP PR denies cost literally zero (spec: a deny naming an unregistered tool is inert).

=== ROUND 2: ALLOW-SIDE (the user-identified gap) ===
5. CONFIRMED CAUSE of observed manual-approval prompts: `MITOSIS_PATH=<path> node --test <file>`
   (settings.local.json:34,37,49). A leading VAR= assignment means the command does not start with
   `node`, so Bash(node:*) at settings.json:21 NEVER matches. Hypotheses about auto-mode fallback,
   not-in-auto-mode, and a hook returning "ask" were NOT needed.
6. settings.local.json grew 15 -> 58 allow rules (25 -> 68 lines) DURING this audit session. Each
   "yes, don't ask again" writes a single-use FULL-ARGV LITERAL that can never match again. The file
   is the friction log, and it grows without ever reducing future prompts. Self-perpetuating.
7. `cp` is the LARGEST measured friction: 23 accumulated approvals vs node --test 9, rm 4, perl 3.
   NEVER INVESTIGATED. Both research rounds were framed around already-suspected shapes — a framing
   error worth naming, not just fixing.
8. Bash(node:*) is dropped in auto mode as a "wildcarded interpreter" (verbatim drop list confirmed).
   Whether Bash(node --test:*) survives as "narrow" is UNSETTLED by the docs — the docs give one
   surviving example (Bash(npm test), zero wildcards) and one dropped example (Bash(python*)), define
   neither category, and `:*` IS a trailing wildcard. Needs an empirical test, not an assumption.
9. Bash(npx tsc:*) as a dropped "package-manager run command": UNVERIFIABLE from docs.

CORRECTIONS MADE THIS SESSION (orchestrator was wrong twice, subagents once):
 - "dead scratchpad paths" was WRONG. Every path still exists; /private/tmp/claude-501/ holds ~190
   unreaped session dirs. The rules are dead by SINGLE-USE EXACTNESS, not missing files. Worse: the
   pathology is self-perpetuating rather than self-cleaning.
 - "node --test is the highest-frequency prompting shape" was WRONG (cp is, by 2.5x).
 - A subagent claimed Playwright MCP is not installed. Wrong — its tools are available this session,
   configured outside enabledPlugins.
 - Bash(nc:*) does NOT over-match `ncdu`/`ncu`. `:*` is word-boundary anchored.

=== HOOK TRUST BOUNDARY ===
Commands run INSIDE hook scripts are subprocesses, NOT tool calls, and bypass the permission system
entirely — no rule evaluation, no classifier. Live corroboration: a subagent's `curl` Bash call was
denied while `npx tsc` inside pre-commit-scoped-verify.sh runs every commit unprompted.
Unchecked surfaces: pre-commit-scoped-verify.sh:22,91,124,137; protect-claude-config.sh:8-9 (python3
importing subprocess); block-destructive-bash.sh:15,22,98; session-config-drift-check.sh:64,71;
plugin-update-check.sh:155 (npm — NETWORK-CAPABLE); graphify-common.sh:18; ledger-*.sh; the
agent-ledger python/mjs handlers.
IMPLICATION: hardening permission rules does NOTHING for code inside these scripts. Two are
network-capable, so a compromised dependency runs with full shell env on every commit or session
start, never surfacing a prompt. Hooks are TRUSTED CODE on the same tier as the permission rules.
The boundary IS defended for edits: protect-claude-config.sh:21 and block-destructive-bash.sh:91-93.
Subagent tool calls DO go through rules + classifier (3 checkpoints; subagent frontmatter
permissionMode is IGNORED). MCP tool calls are checked; what an MCP server runs internally is
[unverified] but architecturally analogous to the hook case.

=== PROPOSED, NOT APPROVED ===
TEST-EXECUTION GATE (design B): a NEW fail-closed PreToolUse hook (not folded into
block-destructive-bash.sh) that emits allow only when every test path realpaths under an approved
root AND is git-tracked; falls through otherwise. Marginal cost ~8ms vs a multi-second classifier
round-trip; the fork cost is already paid because test paths contain `.claude`.
ORCHESTRATOR'S FLAG (not the agent's): as specified, rule 2 rejects leading VAR= and rule 5 rejects
globs — which are EXACTLY the two shapes that actually prompt (MITOSIS_PATH prefix; package.json:7
uses globs). So design B covers NEITHER measured friction without two cheap adjustments: pass a
directory instead of globs, and permit a NAMED assignment allowlist (MITOSIS_PATH only, never
NODE_OPTIONS/NODE_PATH/LD_PRELOAD).
NETWORK RELAXATION: remove curl/wget/http/xh, KEEP nc, compensated by sandbox allowedDomains +
strictAllowlist + autoMode.environment with the literal "$defaults" FIRST (omitting $defaults
discards built-in rules INCLUDING the exfiltration hard deny). Must go in ~/.claude/settings.json —
those keys are ignored from project settings. Honest counterweight: the official docs RECOMMEND the
current blanket denies; this is a deliberate trade, not a doc-endorsed default. Also note the denies
are already circumventable — Bash(node:*) allows `node -e "fetch(...)"`.

=== INCIDENTAL FINDINGS ===
 - .claude/reports/ is NOW gitignored (.gitignore:10). This RESOLVES the blocking caveat on the
   paused mitosis-resilience-implementation thread, whose next-step was exactly this choice.
 - No /verify-<project> command exists (.claude/commands/ holds only pr.md), so verification-discipline
   always takes its fallback branch.
 - Root package.json declares no eslint config or dependency, so has_eslint_config() at
   pre-commit-scoped-verify.sh:110-116 short-circuits — the lint half NEVER runs for this repo.
 - defaultMode is absent from settings, so auto mode is not persisted; it is entered per session.
 - No autoMode.environment block exists, so the classifier trusts only this repo and its
   session-start remotes. The classifier's toolchain-installer allowance (sh.rustup.rs, get.docker.com)
   is unreachable because the curl deny outranks it.

=== PROCESS NOTE ===
Three of eight subagents tripped auto-mode bypass-detection SECURITY WARNINGS while reading public
permission docs and running the documented `claude auto-mode defaults`. Assessed as false positives
and surfaced to the user each time. Later agents were explicitly fenced against inspecting the
Claude Code bundle. If this recurs, the fence is the mitigation, not the finding.

No subagents or background tasks left running at hand-off.