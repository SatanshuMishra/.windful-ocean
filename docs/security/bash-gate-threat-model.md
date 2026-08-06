# Bash gate threat model

Status: ratified 2026-08-05 by the repo owner, after review of scope, assurance level, goals, non-goals, and definition of done. Gate code changes were held pending this ratification; that gate is now passed — the Definition of done (section 7) and the Escalation control (section 8) govern gate changes from here.
Scope of this document: `.claude/hooks/block-destructive-bash.sh` and its supporting files. Written 2026-08-05 on `fix/gate-hardening-followups`, after six consecutive fix rounds each closed one finding and opened another. This document exists to stop a seventh: it draws the line the gate must hold; it does not, and cannot, make the gate hold it. `CLAUDE.md`-style prose is advisory, hooks are deterministic — the code enforces, this document only states what "enforced" means here.

## 1. Scope

The gate is `.claude/hooks/block-destructive-bash.sh` (100 lines, read 2026-08-05), run as a `PreToolUse` hook on every Bash call, plus `.claude/hooks/lib/` (currently holds only `ledger-common.sh`; the hook sources nothing from that directory today).

`~/.claude/hooks/block-destructive-bash.sh` is a symlink into this repo file, and `~/.claude/hooks/lib` is a directory symlink into this repo directory. The working tree IS the live gate: an edit to the repo file changes the running guard immediately, with no install or reload step.

`.claude/settings.json`'s `permissions.deny` / `permissions.allow` complements the hook for the PR-related goals (G1-G3) — see the centralized PR-creation spec (`docs/superpowers/specs/2026-07-27-centralized-pr-creation.md:65`). This is a separate mechanism with a separate propagation path: `~/.claude/settings.json` and `.claude/settings.json` are two distinct real files, neither a symlink to the other, so an edit to the repo's `settings.json` does not take effect the way an edit to the hook script does.

## 2. Assurance level

This gate is a **defense-in-depth control, not a security boundary.** Microsoft's Windows security servicing criteria distinguish the two: a bypass of a security boundary is always serviced as a vulnerability; a bypass of a defense-in-depth feature, by itself, is not — the same table lists UAC, AppLocker, DEP, and ASLR as features it does not service as boundaries. Consequence for this project: **a bypass of this gate alone is not automatically a defect to fix on sight.** It is checked against the Goals and Non-goals below first, per the Escalation control (section 8) — a bypass of a stated Goal is a real finding; a bypass of a stated Non-goal is an accepted risk, not a fix target.

This is still the strongest layer available, not a weak one. Per Anthropic's permissions documentation, a `PreToolUse` `deny` overrides even `bypassPermissions` / `--dangerously-skip-permissions`, and a hook's `allow` cannot loosen a `permissions.deny` rule in `settings.json` — hooks tighten, never loosen; Claude Code evaluates deny/ask rules regardless of what the hook returns.

But the platform's own fail-open default bounds what "strongest" can mean here: per Anthropic's hooks documentation, for most hook events **only exit code 2 blocks** the tool call. Exit code 1 is treated as non-blocking, and every other outcome — a crash, an unhandled exception, a missing interpreter — lets the action proceed. The gate's own code must therefore force a blocking verdict on any internal fault; it must never rely on the platform to fail safe. Where it does not yet do this is recorded as an accepted residual risk (section 6, row 3).

## 3. Adversary model

**In scope:**

- A mistaken agent — wrong command, no ill intent.
- An overreaching agent — exceeds the scope of its authorized task.
- A prompt-injected agent — instructions smuggled through tool output, fetched web content, or file contents the agent reads.
- Ordinary user accidents — a human typing a destructive command through the same interface the agent uses.

**Out of scope, named with reason:**

- A determined human attacker is out of scope BECAUSE that person is the machine owner and already holds unrestricted shell access outside Claude Code, so no `PreToolUse` hook raises their effective privilege bar. Chromium's security FAQ states the general form of this doctrine: no application can defend against a user who already controls the device or account with full privileges.

## 4. Goals (G1-G5)

Each statement is written as a single sentence so it can be lifted verbatim into `docs/invariants/registry.json`'s `{id, statement, source}` shape.

| ID | Statement | Control |
|---|---|---|
| G1 | No pull request in this environment is merged by an agent-issued command; `gh pr merge`, the `gh api .../pulls/<n>/merge` REST call, and the `mergePullRequest` / `enablePullRequestAutomerge` / `enqueuePullRequest` GraphQL mutations are all denied. | Hook deny, sole control (decision 0255). Branch protection is deliberately not deployed: the agent's token carries `repo` scope on a repo the owner owns, so it could delete the rule as easily as merge — the "primary control outside the agent's reach" this cell previously claimed did not exist. If branch protection is ever enabled, a protection-tampering deny must land in the same change. `settings.json`'s `Bash(gh pr merge:*)` rule is not a second layer either: prefix matching cannot express a flag between `gh` and its subcommand, so it misses exactly the phrasings the hook had to be widened for (decision 0257). `enqueuePullRequest` added per decision 0258. |
| G2 | A pull request's title and body, once composed by the centralized `pr-create` tool, are never rewritten afterward through Bash or the GitHub MCP tool. | Denylist over a closed, enumerable surface: `gh pr edit --title/--body/--body-file` (and the `-t`/`-b`/`-F` short forms), `gh api --method PATCH .../pulls/<n>`, the `updatePullRequest` GraphQL mutation, MCP `update_pull_request`. A 2026-08-06 probe (criterion c5) measured every listed Bash form denying except the GraphQL mutation, which was open and is now closed; the mutation clause carries a `([^a-z]\|$)` boundary so it does not also deny `updatePullRequestBranch`, which moves the head branch and rewrites no title or body. `updatePullRequest` is the only GraphQL mutation that rewrites either field, so naming it completes the GraphQL half rather than sampling it. The MCP half needs no hook work: `mcp__github__update_pull_request` and its `mcp__plugin_github_github__` twin are denied in BOTH `.claude/settings.json` and the separate real file `~/.claude/settings.json`, verified 2026-08-06. |
| G3 | Every pull request in this environment is created by the one centralized `pr-create` tool, never by ad-hoc `gh pr create`, raw `gh api` POSTs to the pulls endpoint, or the GitHub MCP `create_pull_request` tool. | Same denylist shape as G2; largely already present in the hook plus `permissions.deny` in `settings.json`. |
| G4 | No agent-issued command removes, overwrites, or relocates a Claude Code guardrail file (a hook, rule, or settings file) without the action being blocked or made deliberately harder. | Path matching against a fixed guardrail-file list, gated on a small verb set (`rm`, `mv`, `cp`, `tee`, `chmod`, `truncate`, `sed -i`, `perl -i`, `git checkout` / `git restore`, redirection), plus a separate branch and reason for `chflags nouchg`; `chflags uchg` adds friction, not removal — the owner can still clear the flag. |
| G5 | No named network command carries a file-reference-shaped argument pointing at a credential or guardrail-adjacent path without the action escalating to human review; an unrecognized command shape escalates to `ask` rather than passing silently. | Argument-shape detection for file-reference flags (`@file`, `-d @file`, `--data-binary @file`, `-F k=@file`) on a handful of named network commands against a deny-path list. |

## 5. Non-goals

Each is one declarative sentence with a named reason, so a future "but what if we hardened it anyway" is answered in advance rather than relitigated.

- Withstanding a determined human attacker is out of scope BECAUSE that person already holds unrestricted shell access outside Claude Code (see section 3); no hook changes their privilege level.
- Perfect bash parsing fidelity is out of scope BECAUSE no available parser — `bashlex` (no heredocs, no arithmetic), `tree-sitter-bash` (a concrete syntax tree for editors, not semantics), mvdan `sh/syntax` (its own README states pure Go "limits how closely the interpreter can follow POSIX/Bash semantics"), `shlex` (its stdlib docs disclaim being a shell parser) — claims full bash semantic fidelity, and a hand-coded parser over what remains a context-sensitive grammar becomes, per LangSec, "indistinguishable from execution engines for exploits coded in the bytes of inputs."
- Enumerating every semantically equivalent form of a destructive command is out of scope BECAUSE independent research against a comparable command denylist (Cursor) proved every denylisted command has infinitely many unlisted equivalent forms (encoding, subshell wrapping, write-to-script-then-execute, quote insertion); an enumerated list built to catch an open-ended category is incomplete by construction, which is why G2-G4 are scoped to closed, enumerable surfaces rather than "all destructive bash."
- Token-scoping the agent's credential to prevent merge is out of scope as a G1 control BECAUSE GitHub gates the merge endpoint (`PUT .../pulls/{n}/merge`) on the Contents permission, the same permission the agent needs to push branches at all — the two are inseparable today, so a narrower token cannot be G1's control. Branch protection is not deployed either (decision 0255), which leaves the hook deny standing alone.

## 6. Accepted residual risks

Rows are added here only through the Escalation control (section 8), governed by Definition of done item 4 (section 7). These are live, accepted exposures of the gate as it runs today; section 9 records forecast costs of the planned five-control decomposition — a different kind of statement, not merged here.

Standing exposures accepted by the step-1 revert that restored HEAD's 100-line gate over the rejected 1,663-line rewrite (preserved, unpushed, at commit `21ae349` on `archive/gate-parser-rewrite-2026-08-05`).

| # | Risk | Status | Where / why |
|---|---|---|---|
| 1 | Wrapper+newline laundering through the `pr-create` self-exemption is reopened. | Closed 2026-08-06 by criterion c5, as a side effect of per-segment classification rather than by a control aimed at it. Retained as history, not as a live exposure. | Was `block-destructive-bash.sh:43,52` (the `selfwrap` exemption). The laundering worked because the extractor collapsed newlines into spaces, so a second command riding behind the wrapper on line 2 was never a separate command to classify. c5 preserved newlines and made every clause evaluate per segment, so the ridden command is now classified on its own. Five laundering forms were measured denying afterward: newline+`gh pr create`, newline+`gh pr merge`, `;`, `&&`, and `$(...)` substitution. |
| 2 | Attached-form `-f body=@<path>` exfiltration, raw `/graphql` endpoints, `git checkout` of the hook itself, `perl -pi` of the hook, `cp /tmp/x .claude/`. | Partly closed 2026-08-06 (criterion c4): `git checkout`/`git restore`, `perl -i`, the bare-directory `cp` destination and the leading-slash `/graphql` endpoint all now classify. The `-f body=@<path>` exfiltration half stays open and is criterion c6's target. | Named here so they are tracked as accepted, not forgotten. |
| 3 | Fail-open by default: three distinct paths let the gate proceed without forming an opinion, indistinguishable in effect from a deliberate allow. | Closed 2026-08-05 by commit `97b3e8b` (criterion c3): every exit routes through one verdict emitter under an EXIT trap, no-opinion became an explicit token, and a fourth path (an unevaluable matcher reading as no match) was found and closed with them. Retained here as history, not as a live exposure. | (a) `block-destructive-bash.sh:4-7` — the `case` prefilter exits 0 on any input missing all of its substrings (`rm`, `git`, `gh`, `dd`, `mkfs`, `:\|:`, `>` `/dev/`, `.claude`), before any analysis runs. (b) `block-destructive-bash.sh:9-16` — the `python3` JSON extractor swallows any exception (`2>/dev/null \|\| true`) into an empty `cmd`, then `[ -z "$cmd" ] && exit 0` allows. (c) `block-destructive-bash.sh:96` — `[ -z "$reason" ] && exit 0`, the gate's intended "no opinion" path, legitimate by design but indistinguishable in effect from (a) and (b). Fix in a future rebuild: make "no opinion" an explicit token, never silence, across all three paths. |
| 4 | Boundary-regex false positive: a command that merely *contains* the string `gh pr merge` (e.g., inside a `printf` argument) is denied even though nothing is executed. Two refinements measured 2026-08-06: (a) the surface is narrower and less predictable than "contains the string" — `git commit -m "... gh pr merge ..."` denies while `grep -rn "gh pr merge" docs/` does not, because the clause requires whitespace or end-of-string after `merge`; (b) a compound line can satisfy a conjunction from fragments of *different* sub-commands, so any multi-command line is a deny candidate. | Closed 2026-08-06 by criterion c5 per decision 0259, for both refinements. Residual false positives are rows 11 and 12. | Was `has()` doing an unanchored substring search over the whole command string. (b) is closed by per-segment classification, which also fixed an unrecorded instance in the `ask` family — `ls -rf /tmp; rm /tmp/one-file.txt` asked, satisfying the `rm`/`-r`/`-f` conjunction from two sub-commands. (a) is closed by requiring the `gh` token in command position (segment start, or after `$(` or a backtick), allowing a path prefix, `VAR=value` assignments, and the transparent wrappers `sudo`/`env`/`command`/`nohup`/`time`/`xargs`/`sh -c`. Anchoring is deliberately NOT applied to the `git`, `rm`, or guardrail matchers: those return `ask`, and a false ask costs one confirmation while a false deny blocks work outright. |
| 5 | Quote or empty-string insertion inside the command word evades every clause: `g"h" pr merge 12`, `gh pr "merge" 12`, `gh pr me''rge 12`. | Live, measured 2026-08-06. | Non-goal 3 names quote insertion verbatim; removing quotes first requires the bash parsing fidelity ruled out by non-goal 2. |
| 6 | Shell-variable indirection for the binary or the subcommand evades every clause: `G=gh; $G pr merge 12`, `gh pr $SUB 12`. | Live, measured 2026-08-06. | Non-goals 2 and 3. The gate sees pre-expansion text; resolving `$G` means evaluating shell state, i.e. becoming the execution engine LangSec warns about. |
| 7 | A client-side `gh` alias evades every clause: `gh mergeit 12` where the alias expands to `pr merge`. | Live, measured 2026-08-06. | Non-goal 3. The expansion lives in `gh` config, not in the command text a text denylist can see. |
| 8 | Non-`gh` clients reaching the same REST endpoint evade every merge clause: `curl -X PUT .../pulls/12/merge`, `python3 -c "import urllib.request ... method='PUT'"`. | Live, measured 2026-08-06. | Non-goal 3, and forecast in section 9. All three merge clauses anchor on the `gh` token. This is the exposure branch protection would have covered and, per decision 0255, no longer does. |
| 9 | Write-to-script-then-execute evades on any encoding. The plaintext form happens to deny, but only as a substring artifact of row 4 — a base64 or heredoc payload would not. | Live, measured 2026-08-06. | Non-goal 3 names it verbatim. Do not count the incidental deny as coverage. |
| 10 | The bare-directory guardrail path added in c4 widens row 4's unanchored-`>` false positive to commands that merely mention `.claude` as a token: `ls .claude > /tmp/list.txt` and `echo "see .claude for config" > /tmp/note.txt` now ask. | Live, introduced 2026-08-06 by criterion c4, knowingly. | Same root cause as row 4; the verdict is `ask`, never `deny`, and tying `>` to its redirect target requires parsing redirection. Accepted as one confirmation prompt in exchange for closing `cp /tmp/settings.json .claude/`. |

| 11 | Segmentation is quote-blind, so a quoted string carrying a shell separator followed by a command-shaped phrase still denies: `echo "a; gh pr create b"`. A heredoc body line beginning with a denied phrasing denies for the same reason. | Live, introduced 2026-08-06 by criterion c5, knowingly. | Making this exact needs a quote-state lexer, i.e. the bash parsing fidelity ruled out by non-goal 2. Accepted because c5 removed the far commoner shapes: a phrase quoted mid-argument (`git commit -m "... gh pr create ..."`) no longer denies at all. |
| 12 | The `pr-create` self-exemption is now dead weight: every clause it guards requires the `gh` token, which after c5 requires command position, so within the wrapper's own segment the exemption can no longer change any verdict. | Live as a maintenance hazard, not an exposure. Measured 2026-08-06; no test can distinguish it firing from it not firing. | `block-destructive-bash.sh` — `selfwrap` / `chained`. It is inert today, but a future clause added to that block that does NOT depend on the `gh` token would be silently exempted for any command starting with the wrapper. Delete it, or re-derive it, in whichever criterion next edits that block. |

## 7. Definition of done

For any change to this gate, all four must hold:

1. Closes G1-G5 against normal and mildly obfuscated phrasing.
2. Parser/classifier uncertainty fails closed to `ask`, never silently to `allow`.
3. Covered by tests keyed to G1-G5, not to a defect count.
4. A finding against a stated non-goal is logged as an accepted risk, not fixed.

## 8. Escalation control

Every new finding against this gate is checked against the Goals and Non-goals above BEFORE a fix round starts: a finding against a Goal is a real defect; a finding against a Non-goal is logged in section 6 as accepted risk, not patched. Fix rounds against the same defect class are capped. On reaching the cap, the correct response is to rewrite from the last approved state, not to continue patching — patching past the cap is exactly the failure mode this document exists to stop (see the header).

## 9. Known weaknesses of this design

These are forecast costs of the planned five-control decomposition, not yet built; section 6's accepted residual risks are live exposures of the gate running today — a different kind of statement, not merged here.

The chosen decomposition (G1-G5, five heterogeneous controls) trades one drift surface for five: five separate "have I covered X" questions where the monolith had one. Recorded here rather than buried because it is the strongest argument against the shape chosen, and the shape is a starting point to revisit, not a closed spec.

G5 is still a parser. Splitting exfiltration detection out of the monolith shrank its differential space; it did not vanish it. `python3 -c "import urllib..."` does not look like `curl` and would evade a named-command list. G5's residual risk in this class is bounded only by its obligation to fail to `ask` on an unrecognized command carrying a file-reference-shaped argument — never to `allow`. If that obligation is not met by an implementation, the implementation fails Definition of done item 2, full stop.

## 10. References

- Microsoft, Windows security servicing criteria (defense-in-depth vs. security boundary, UAC/AppLocker/DEP/ASLR not serviced as boundaries): https://www.microsoft.com/en-us/msrc/windows-security-servicing-criteria
- Chromium security FAQ (no defense against a user who already controls the device/account): https://chromium.googlesource.com/chromium/src/+/HEAD/docs/security/faq.md
- Anthropic, Claude Code hooks reference (exit code 2 is the only blocking outcome; `permissionDecision` schema): https://code.claude.com/docs/en/hooks
- Anthropic, Claude Code hooks guide (exit-code behavior restated): https://code.claude.com/docs/en/hooks-guide
- Anthropic, Claude Code permissions (argument-constraining rules are fragile, worked `curl` bypass; hook decisions don't bypass permission rules; recommends a PreToolUse hook for a hard allow/deny): https://code.claude.com/docs/en/permissions
- Anthropic, Claude Code sandboxing (`sandbox.filesystem.denyRead` default still permits `~/.ssh` and `~/.aws/credentials` unless explicitly denied): https://code.claude.com/docs/en/sandboxing
- Backslash Security, Cursor command-denylist bypass research (four bypass classes; infinitely many unlisted equivalent forms for any denylisted command): https://www.backslash.security/blog/cursor-ai-security-flaw-autorun-denylist
- LangSec (Ali et al.), on hand-coded parsers over context-sensitive grammars: https://langsec.org/spw23/papers/Ali_LangSec23.pdf
- GitHub docs, protected branches (server-side control for G1): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub CLI manual, `gh api` (`-F key=@file` reads from disk, confirmed current behavior, relevant to G5): https://cli.github.com/manual/gh_api
- `docs/superpowers/specs/2026-07-27-centralized-pr-creation.md` (in-repo spec establishing the "one tool, one gate, one rule" shape this gate's G1-G3 implement).
