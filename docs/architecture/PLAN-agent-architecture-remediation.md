# Implementation plan: agent architecture remediation

Executes `SPEC-agent-architecture-remediation.md` revision 3, in that document's §9 order, without reordering.

Every step states its goal, the literal actions, the verification that closes it, and the condition that halts it. A halt is a stop, not a prompt to improvise.

---

## Operating facts — read before step 1

**1. Every `~/.claude` path is a symlink into this repository's working tree.**

| Path | Resolves to |
|---|---|
| `~/.claude/agents` | `.windful-ocean/.claude/agents` |
| `~/.claude/rules` | `.windful-ocean/.claude/rules` |
| `~/.claude/skills` | `.windful-ocean/.claude/skills` |
| `~/.claude/hooks` | `.windful-ocean/.claude/hooks` |
| `~/.claude/settings.json` | `.windful-ocean/.claude/settings.json` |
| `~/.claude/CLAUDE.md` | `.windful-ocean/.claude/CLAUDE.md` |

Consequences that govern every step: editing `~/.claude/...` edits this repo on whatever branch is checked out; `git checkout` changes the live configuration; and nothing is in force in a *new* session until the change is committed and on the branch that session's checkout holds.

**1b. A recursive grep over these paths needs a trailing slash, or it silently scans nothing.** BSD `grep -r` refuses to traverse a symlinked directory given without one; it prints nothing and exits 0. `/usr/bin/grep` and `ugrep` behave the same, and `-R` does not fix it. `grep -rl 'the' ~/.claude/rules` returns 0 files; `~/.claude/rules/` returns 20. Every census in this plan runs in the scan-proving form the SPEC defines under §8, and a `scanned=0` is an instrument failure, never a pass.

**2. This repository is public.** No confidential project codename reaches any tracked file. Refer to the incident only as session `cfdbeee9`.

**3. Restart points.** Claude Code watches `~/.claude/agents` and `~/.claude/skills` and applies edits within seconds — no restart for those. `settings.json` resolves at session start, so **step 2 requires a restart before step 3**. Separately, agent definition edits do not reach dispatches made in the same session, so **step 5 requires a restart before step 6**, and **step 8 requires a restart before step 10**.

**4. Branch.** Work continues on `docs/agent-architecture-spec`, cut from `origin/main`. Never commit to `main`.

**5. Commit cadence.** One commit per step, Conventional Commits, scope `config`. Ten steps, ten commits. Do not batch.

---

## Blocker B1 — DISSOLVED by SPEC revision 4

B1 recorded that check 8.5's 13,000-byte ceiling was unreachable: the six rules §5.2 kept totalled 11,698 bytes and `CLAUDE.md` another 2,070, putting the subtotal at 13,768 before the new delegation rule existed. Three resolutions were costed — trim in place, split to a skill, or raise the ceiling.

**None was taken.** SPEC revision 4 re-disposed all eighteen rule files under a second test — does a rule change behaviour, or only restate a default or duplicate a mechanism that already binds — and all six formerly-kept files changed disposition. The preamble now lands near 5,850 bytes, so the ceiling carries ~2.2x headroom and the question B1 asked no longer arises.

Check 8.5 keeps its 13,000 value deliberately. It is now a circuit breaker in the §0.3 sense — set where it never fires in normal operation — rather than a target to squeeze under. Tightening it to just above the new figure would make it a change-detector that fails on the next legitimate addition.

**Step 8 is unblocked. Proceed without a user decision.**

## Blocker B2 — criterion c4's check is broken independently

Thread criterion c4 runs `cat ~/.claude/rules/common/*.md ~/.claude/rules/common/git/*.md ~/.claude/CLAUDE.md | wc -c`. After step 8, `rules/common/git/` is empty: §5.2 moves `commits.md` and `branching.md` into the `committing-work` skill and `pull-requests.md` is already the `pr` skill. The glob then matches nothing, the shell passes it through literally, and `cat` exits non-zero instead of returning a count.

**Fix at step 10:** amend c4 to drop the `git/*.md` term, matching §8.5. Do not "fix" it by leaving an empty file in the directory.

---

## Step 1 — transitional deny rules (§6.5)

**Goal.** Stop the nine outgoing agents being dispatched before their files are touched.

**Action.** Add to `permissions.deny` in `~/.claude/settings.json`:

```python
import json, pathlib
p = pathlib.Path.home() / ".claude/settings.json"
d = json.loads(p.read_text())
deny = d.setdefault("permissions", {}).setdefault("deny", [])
for a in ["delivery-lead","implementer","test-engineer","platform-engineer","verifier",
          "architect","investigator","technical-writer","release-engineer"]:
    entry = "Agent(%s)" % a
    if entry not in deny:
        deny.append(entry)
p.write_text(json.dumps(d, indent=2) + "\n")
```

**Verify.** `python3 -c "import json;d=json.load(open('$HOME/.claude/settings.json'));print(sum(1 for x in d['permissions']['deny'] if x.startswith('Agent(')))"` returns `9`.

**Halt if.** The file does not parse as JSON after the write, or the count is not 9.

**Commit.** `chore(config): deny the nine outgoing agent types during remediation`

---

## Step 2 — depth limit and the two hooks (§6.1, §6.3, §6.4)

**Goal.** Mechanisms live before any prose changes, so no window exists where enforcement is absent.

**Action A — write `~/.claude/hooks/deny-hold-loop.sh`**, mode 755:

```bash
#!/usr/bin/env bash
set -uo pipefail
input="$(cat)"
verdict="$(printf '%s' "$input" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("allow"); raise SystemExit(0)
cmd = (d.get("tool_input") or {}).get("command", "") or ""
has_sleep = re.search(r"\bsleep\b", cmd) is not None
has_loop = re.search(r"\b(while|until|for)\b", cmd) is not None
print("deny" if (has_sleep and has_loop) else "allow")
' 2>/dev/null || echo allow)"
if [ "$verdict" = "deny" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Hold loops are denied. A subagent result is delivered to you automatically when it completes, and arrives whether you are idle or not. End your turn instead of holding it open."}}'
fi
exit 0
```

**Action B — write `~/.claude/hooks/deny-task-output-read.sh`**, mode 755:

```bash
#!/usr/bin/env bash
set -uo pipefail
input="$(cat)"
verdict="$(printf '%s' "$input" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("allow"); raise SystemExit(0)
p = (d.get("tool_input") or {}).get("file_path", "") or ""
print("deny" if re.search(r"/tasks/[^/]*\.output$", p) else "allow")
' 2>/dev/null || echo allow)"
if [ "$verdict" = "deny" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Task output files are not read directly. A completed task delivers its result to you; re-reading the output file re-pays its full token cost. Wait for the completion notice instead."}}'
fi
exit 0
```

Both match the deny convention `block-destructive-bash.sh` already uses: JSON on stdout carrying `hookSpecificOutput.permissionDecision`, and `exit 0` on allow. Both fail open on a parse error, which is deliberate — a broken gate must not wedge every Bash call.

**Action C — register them and set the depth limit:**

```python
import json, pathlib
p = pathlib.Path.home() / ".claude/settings.json"
d = json.loads(p.read_text())
d.setdefault("env", {})["CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH"] = "1"
pre = d.setdefault("hooks", {}).setdefault("PreToolUse", [])
want = [("Bash", "$HOME/.claude/hooks/deny-hold-loop.sh"),
        ("Read", "$HOME/.claude/hooks/deny-task-output-read.sh")]
for matcher, cmd in want:
    if not any(cmd in h.get("command", "") for e in pre for h in e.get("hooks", [])):
        pre.append({"matcher": matcher, "hooks": [{"type": "command", "command": cmd}]})
p.write_text(json.dumps(d, indent=2) + "\n")
```

The existing `Bash` matcher entry for `block-destructive-bash.sh` is left alone; a second `Bash` entry is appended rather than merged, so the two gates stay independently readable and independently removable.

**Verify.** Both scripts are executable; `settings.json` parses; `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH == "1"`; `PreToolUse` contains both commands.

**Halt if.** `settings.json` does not parse, or either script is not mode 755.

**Commit.** `feat(config): add hold-loop and task-output gates, cap subagent depth at 1`

**→ RESTART REQUIRED before step 3.** `settings.json` resolves at session start; without a restart the old gate set is still in force and step 3 tests nothing.

---

## Step 3 — verify the mechanisms (8.10, 8.11, 8.12)

**Goal.** Mechanisms confirmed working before anything is deleted.

| Check | Action | Expected |
|---|---|---|
| 8.10 | Run `i=0; until [ $i -ge 3 ]; do sleep 1; i=$((i+1)); done` | Denied, reason names hold loops |
| 8.10 negative | Run `sleep 1` alone | Allowed — a bare sleep is not a loop |
| 8.10 negative | Run `for f in a b; do echo $f; done` | Allowed — a loop without sleep |
| 8.11 | `Read` any path matching `…/tasks/x.output` | Denied |
| 8.11 negative | `Read` any other path | Allowed |
| 8.12 | Dispatch one agent instructed to dispatch a child of its own | Child dispatch fails; no `spawnDepth: 2` in the session's `subagents/*.meta.json` |

The two negative cases for 8.10 and the one for 8.11 are not optional. A gate that denies everything passes its positive test and is a worse defect than the pathology it replaced.

**Halt if.** Any positive case is allowed, or any negative case is denied.

**Commit.** None — this step writes nothing.

---

## Step 4 — create the four skills (§4)

**Goal.** Procedure exists before the agent carrying it is removed.

Each skill is `~/.claude/skills/<name>/SKILL.md` — exact filename, inside a named directory (K1). Frontmatter carries `description` answering both what it does and when to use it, key use case first (K2), with trigger phrases in the words a request actually uses (K3). Body under 500 lines (K4). **`allowed-tools` is never set as a restriction (K6, conflict C1) — it pre-approves and does not restrict.** **`disable-model-invocation` is never `true` on any of these four (K8) — all four are preloaded via a `skills:` field and that flag blocks preloading.**

| Skill | Content source | Preloaded into |
|---|---|---|
| `writing-tests` | `rules/common/testing.md` (6,668 B) + the procedural half of `agents/test-engineer.md` | `machinist` |
| `committing-work` | `rules/common/git/commits.md` (2,561 B) + `rules/common/git/branching.md` (327 B) | `machinist` |
| `reviewing-code` | the body of `agents/code-reviewer.md` | `code-reviewer` |
| `research-citations` | `rules/common/research-citations.md` (1,460 B) | `researcher` |

These are moves, not rewrites. Carry the source content across intact, minus any persona framing and minus anything that is a Three Pillars restatement. Do not author new procedure. Do not add comments (global rule).

### 4b. Absorb relocated procedure into two existing skills

SPEC revision 4 moves content out of two files that step 8 then compresses. Both moves land here, because §9's ordering principle is that procedure exists before its source is removed.

| Into | From | Content |
|---|---|---|
| `platform-engineer` (exists) | `no-direct-db-access.md` §5.2.1 | "Migrations and Schema Changes" (553 B) and "Live Data Inspection" (445 B) — the paste-cycle workflow, which is procedure rather than prohibition |

Nothing moves into `vibesec`. `security.md`'s checklist is deleted rather than relocated, because `vibesec` already covers every item in more depth — relocating it would create the duplication §5.2 is removing.

**Do not create:** an implementation skill, a documentation skill, a release skill, a migration skill, or a verification skill. §4 rejects each by name — the first three are persona-only, and the last two already exist as `platform-engineer` and `verification-discipline`.

**Verify.** All four `SKILL.md` files exist; `grep -c 'disable-model-invocation: *true'` returns `0` on each; no file exceeds 500 lines; `grep -c 'allowed-tools'` returns `0` on each.

**Halt if.** Any of the four already existed before this step — that means the source content has two homes and the duplicate must be resolved first.

**Commit.** `feat(config): add writing-tests, committing-work, reviewing-code, research-citations skills`

---

## Step 5 — write `machinist`, rewrite the four retained agents (§3.4, §6.2)

**Goal.** The five-agent roster exists and references the skills from step 4.

### 5a. `~/.claude/agents/machinist.md`

Frontmatter exactly as §3.3 specifies:

```yaml
---
name: machinist
description: >
  Applies a change that is fully specified before dispatch, across many files,
  in its own worktree. Use ONLY when all three hold: the change needs no
  discovery, it touches enough files that doing it here would flood this
  conversation, and no step depends on what an earlier step finds. If any one
  fails, do the work here.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
maxTurns: 800
isolation: worktree
skills: writing-tests, committing-work, platform-engineer
---
```

The description must not name `fork` — check 8.14 censuses `~/.claude/agents/` for that word and the SPEC's own revision 2 draft of this block failed it.

### 5b. Frontmatter for the four retained agents (§3.4, §3.5)

| Agent | `model` | `maxTurns` | `skills:` | `tools` |
|---|---|---:|---|---|
| `code-reviewer` | explicit | 300 | `reviewing-code` | minimum viable, never omitted |
| `security-reviewer` | explicit | 300 | `vibesec` | minimum viable |
| `conformance-auditor` | explicit | 300 | `conformance-auditor` | minimum viable |
| `researcher` | explicit | 300 | `research-citations` | minimum viable |

`tools` is always an explicit allowlist (S5) — omitting it inherits every tool available to subagents. `maxTurns` is always set (S6); the values are the measured circuit breakers from §3.5, not preferences.

**`security-reviewer` must preload `vibesec`.** Step 8 compresses `security.md` on the grounds that `vibesec` covers its checklist in more depth. Without this wiring the agent knows less about security after the change than before, and the compression becomes a net loss. `vibesec` does not set `disable-model-invocation`, so it is preloadable (K8, verified).

Each `description` states its precondition and an explicit "do NOT use when" clause (S1). Keep all five descriptions mutually distinct (K10) and short — detail belongs in the body, which loads only on dispatch.

### 5c. Body shape, identical for all five (S2, S3, S4, S7, S8)

Body carries role, entry invariant, output format, and stop conditions **only** (S8). Procedure arrives via `skills:` and is never duplicated into the body (S7).

The output format is numbered sections, and **section 1 is always the entry invariant** (S4, §8.8 greps for the literal string `1. Entry invariant`):

```
1. Entry invariant
2. <the agent's result sections>
…
N. Obstacles Encountered
N+1. BLOCKING: <command that must exit 0 before this ships>   (reviewers and auditor only)
```

Every section beyond the first carries at least one work-forcing field — a count, an ordered enumeration with nothing left off it, a verbatim quote, or a command with its captured exit code. A field answerable by attestation is not a field.

### 5d. Entry invariants (§6.2) — section 1 of each body

| Agent | Invariant | Proof it prints |
|---|---|---|
| `code-reviewer` | A diff exists that this agent did not write, **and every standard named in the brief resolves to a path** | `git diff --stat <base>..HEAD` non-empty, output quoted; each named standard `test -f` exit 0, path quoted |
| `security-reviewer` | Same | Same |
| `conformance-auditor` | A named standard and a named artifact both resolve to real paths | both `test -f` exit 0, both paths quoted |
| `researcher` | The question requires a source outside this repository | names the source before searching |
| `machinist` | The brief names every file to be touched | enumerates them, counts them, halts if the brief named none |

**On the reviewer clause.** The wording is *every standard named in the brief*. A brief naming no standard passes, and a general-quality review proceeds against the always-on rules the subagent receives verbatim. The clause fires only on a named criterion that resolves to nothing. That vacuous pass is the correct semantics, not a gap.

**A failed invariant is a halt with a stated reason, not a finding.** The agent returns section 1 and nothing else.

**Verify.** `ls ~/.claude/agents/*.md | wc -l` returns `14` at this point — nine outgoing files are still present and are removed at step 7. `grep -L '^maxTurns:' ~/.claude/agents/{machinist,code-reviewer,security-reviewer,conformance-auditor,researcher}.md | wc -l` returns `0`. `grep -c '1. Entry invariant'` returns `1` on each of the five.

**Halt if.** Any of the five omits `tools`, `model`, or `maxTurns`; or any names a skill that sets `disable-model-invocation: true`.

**Commit.** `feat(config): add machinist, rewrite the four retained agents with entry invariants`

**→ RESTART REQUIRED before step 6.** Agent definition edits do not reach dispatches made in the same session; without a restart, step 6 tests the previous definitions.

---

## Step 6 — verify the new agents (8.9, 8.13)

| Check | Action | Expected |
|---|---|---|
| 8.9 | Dispatch `code-reviewer` against a branch with an empty diff | Halts naming the empty diff; produces no review |
| 8.9 extension | Dispatch `code-reviewer` with a brief naming a standard that resolves to no path | Halts naming the unresolvable standard |
| 8.9 negative | Dispatch `code-reviewer` on a real diff with no named standard | Proceeds — the vacuous pass is correct |
| 8.13 | Dispatch two `machinist` agents concurrently | Two distinct worktree paths; no `index.lock` error |

The 8.9 negative case is not optional. Without it, an invariant that halts on everything looks identical to one that works.

**Halt if.** Any halt case proceeds, or the negative case halts.

**Commit.** None — this step writes nothing.

---

## Step 7 — delete the nine outgoing agent files (§3.1)

**Goal.** Their replacements are live, so the originals go.

```bash
git -C "$REPO" rm .claude/agents/{delivery-lead,architect,investigator,verifier,technical-writer,release-engineer,implementer,test-engineer,platform-engineer}.md
```

Nine files. `platform-engineer.md` the **agent** is deleted; `~/.claude/skills/platform-engineer/` the **skill** stays and is preloaded into `machinist`. Do not confuse them.

**Verify.** `ls ~/.claude/agents/*.md | wc -l` returns `5`, and the five basenames are exactly `code-reviewer`, `security-reviewer`, `conformance-auditor`, `researcher`, `machinist`. This closes criterion c1.

**Halt if.** The count is not 5, or any basename differs.

**Commit.** `refactor(config): delete the nine superseded agent definitions`

---

## Step 8 — rule dispositions and the delegation replacement (§5.2, §5.3, §5.4)

**Goal.** The preamble shrinks last, once nothing depends on the moved content. Target: ~5,850 bytes total, against a 13,000 ceiling.

### 8a. Delete seven files outright

`agents.md`, `delegation-discipline.md`, `git-workflow.md`, `writing-style.md`, `performance.md`, `patterns.md`, `hooks.md`.

`agents.md` carries the false claim at `:17` that caused the incident. Its accurate content — parallelism decided by shared state, and work-forcing fields — moves into the five agent bodies written at step 5, where it is actually needed.

### 8b. Delete five already-relocated files

`testing.md`, `git/commits.md`, `git/branching.md`, `research-citations.md` moved to skills at step 4; `git/pull-requests.md` is already the `pr` skill. Delete the originals now, not before — step 4 is their new home and it must exist first. `rules/common/git/` is then empty; remove the directory rather than leaving it with a placeholder.

### 8c. Delete `pillars.md`

T2 failure. The rule survives as the `CLAUDE.md` bullet that already states it; only the rationale is lost. Drop the trailing pointer from that bullet per 8f.

### 8d. Compress four files

Each keeps only the part that passes T2. Targets are budget guidance, not thresholds to hit exactly.

| File | 4,293 → | What survives | What goes |
|---|---|---|---|
| `no-comments.md` | ~300 | The rule, one sentence. The functional carve-out list: shebangs, tooling pragmas, codegen and SPDX markers | The "Why" section, the four-bullet expansion, the editing-existing-comments paragraph. All restated in `CLAUDE.md` and in every agent body |
| `coding-style.md` | ~300 | The immutability rule — genuinely non-default in Python and JavaScript | Error handling, input validation, the quality checklist (textbook, same species as `patterns.md`), and the 200/400/800-line ceilings, which are naked thresholds §0.3 forbids |
| `security.md` | ~400 | The security response protocol, and the `docs/security/bash-gate-threat-model.md` pointer with its precedence carve-out | The pre-commit checklist — every item is covered deeper by `vibesec`, and its first line is already enforced by `secret-scanner.sh` on `Edit\|Write`. The secret-management section, for the same reason |
| `memory-discipline.md` | ~1,200 | Storage filter, recall discipline, curation. The only one of the six passing T2 intact | Light trim only. Do not restructure |

### 8e. Rescope and split `no-direct-db-access.md` (§5.2.1)

Target ~600 bytes, down from 4,293.

| Section | B | Action |
|---|---:|---|
| Header + opening | 323 | Keep, **rescoped** from "a project database" to *live, hosted, staging or production* |
| Hard Prohibitions | 663 | Keep, rescoped. Drop the MCP product enumeration, which dates |
| Migrations and Schema Changes | 553 | Already moved to `platform-engineer` at step 4 — delete here |
| Live Data Inspection | 445 | Already moved to `platform-engineer` at step 4 — delete here |
| What Stays Allowed | 408 | **Delete.** Enumerates things the rescoped prohibition never covered |
| Test-Only Container Exception | 1,377 | **Delete.** A local container is not a live database, so it needs no exception |
| Why | 520 | Compress to one line |

**Do not replace the prohibition with a pointer to the bash gate.** `block-destructive-bash.sh` matches the Supabase CLI path only; it does not match `psql`, a raw `DATABASE_URL`, or a generic Postgres client. The general prohibition stays as prose precisely because the mechanism is narrower than the rule.

### 8f. Write the §5.3 replacement

New file replacing `delegation-discipline.md`. Content exactly:

```markdown
# Delegation

The main thread does the work. Delegation is the exception, and it needs a reason from this list:

1. A diff exists and needs review by something that did not write it.
2. A question needs external web research.
3. Exploration would read many files whose contents will never be referenced again.
4. A fully specified change touches enough files to flood this conversation, and no step of it depends on what an earlier step finds.

If none of those hold, do the work here.

Everything a dispatched agent needs must be addressable without this conversation: a path, a commit range, or a question. Work that can only be described by referring to what has already happened here is work that stays here.
```

Nothing more. No worked examples, no rationale — both belong in the SPEC, which is not always-on.

### 8g. Rewrite `CLAUDE.md`

Three changes.

**Add the §5.4 prohibition:**

```markdown
No file in this configuration describes what Claude Code can or cannot do. Not its turn lifetime, not whether subagents survive, not what is delivered when, not what a tool returns. The harness describes itself at runtime, accurately, for free, and it updates without telling this repository.

Configuration states preferences, constraints, and facts about this project that the harness cannot know. Nothing else.
```

**Strip all six dead pointers (§5.2.2).** Every bullet ending in a `~/.claude/rules/...` path names a file that is already in context — the pointer costs bytes and resolves to something the reader holds. Where the target is deleted, the bullet keeps its rule and loses the reference.

**Replace the delegation bullet.** The bullet beginning "The main thread orchestrates and does not perform: delegate every code mutation…" is the single sentence this entire remediation exists to reverse. Replace with one line pointing at the new delegation rule's default: main does the work, delegation is the exception.

### Verify

| Check | Expected |
|---|---|
| `cat ~/.claude/rules/common/*.md ~/.claude/CLAUDE.md \| wc -c` | under 13,000; expect ~5,850 |
| `ls ~/.claude/rules/common/*.md \| wc -l` | `6` — no-comments, coding-style, security, memory-discipline, no-direct-db-access, and the new delegation file. `pillars.md` is gone |
| `test -d ~/.claude/rules/common/git` | false |
| capability-claim census (SPEC §8 form, trailing slashes) | `scanned>0 matches=0`; was `3` before the work |
| `grep -c 'rules/common' ~/.claude/CLAUDE.md` | `0` |

**Halt if.** The byte count exceeds 13,000 — at ~2.2x headroom that means a compression was not performed, not that the ceiling is wrong. Re-measure per file against the §5.2 targets before touching the ceiling.

**Commit.** `refactor(config): re-dispose the always-on preamble under the behaviour test`

**→ RESTART REQUIRED before step 10.**

## Step 9 — remove the transitional deny rules (§6.5)

**Goal.** A deleted definition needs no deny rule.

Remove the nine `Agent(...)` entries added at step 1 from `permissions.deny`.

**Verify.** `python3 -c "import json;d=json.load(open('$HOME/.claude/settings.json'));print([x for x in d['permissions']['deny'] if x.startswith('Agent(')])"` returns `[]`.

**Halt if.** Step 7 did not complete. The deny rules are the only thing standing between a stale dispatch and a missing file.

**Commit.** `chore(config): drop the transitional agent deny rules`

---

## Step 10 — full acceptance (§8)

Run all fourteen checks. Record each result verbatim against its thread criterion.

| # | Check | Expected | Thread criterion |
|---|---|---|---|
| 8.1 | `ls ~/.claude/agents/*.md \| wc -l` | `5` | c1 |
| 8.2 | census, pattern `does not survive` | `scanned>0 matches=0`; was `2` | — |
| 8.3 | `grep -L "^maxTurns:" ~/.claude/agents/*.md \| wc -l` | `0` | c3 |
| 8.4 | census, capability-claim pattern | `scanned>0 matches=0`; was `3` | c2 |
| 8.5 | always-on byte count | `< 13000`, expect ~5,850 | c4 |
| 8.6 | `/skill-doctor` report | captured before and after | c12 |
| 8.7 | no preloaded skill sets `disable-model-invocation: true` | `0` | c5 |
| 8.8 | `grep -c "1\. Entry invariant" ~/.claude/agents/*.md` | `1` per file | c9 |
| 8.9 | empty-diff dispatch halts | halts | c10 |
| 8.10 | hold gate fires | denied | c6 |
| 8.11 | task-output gate fires | denied | c7 |
| 8.12 | depth limit holds | no depth-2 agent | c8 |
| 8.13 | worktree isolation holds | two paths, no lock error | c11 |
| 8.14 | census, pattern `\bfork` | `scanned>0 matches=0`; was already `0` | — |

**8.2 is redundant with 8.4** — `does not survive` is now folded into 8.4's alternation explicitly. Run both; the duplication costs nothing and removing it is not in scope. Both had a true pre-change reading above zero (2 and 3), so unlike the vacuous form they actually distinguish before from after.

**8.6 needs a before-reading.** Criterion c12 requires `/skill-doctor` captured at both points. If no before-reading was taken prior to step 4, c12 closes as `unverified-reasoned` naming the missing baseline. Do not fabricate one.

**Two amendments to make here, both from B2 and §8:**
1. Amend c4 to drop the `~/.claude/rules/common/git/*.md` term.
2. Add two criteria covering 8.14 and the reviewer-clause extension, which the thread's original twelve predate.

**Halt if.** Any check fails. A failing check is a defect in the work, never a reason to adjust the check.

**Commit.** `chore(config): record agent architecture remediation acceptance results`

---

## What this plan does not do

- **No PR.** Opening one is a separate act, through `node .claude/lib/git/pr.mjs pr-create` only. Never ad-hoc `gh pr create`.
- **No re-measurement of the incident.** Those figures are in the SPEC. Re-measuring is a second error source, not confirmation.
- **No proof that the configuration is better.** §8 proves it is *applied*. §10.6 is explicit that improvement needs a comparable unit of work run afterwards, measured on agents per unit, wall-clock per unit, and peak main-thread context.
- **No change outside `~/.claude` and this checkout.**
