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

**2. This repository is public.** No confidential project codename reaches any tracked file. Refer to the incident only as session `cfdbeee9`.

**3. Restart points.** Claude Code watches `~/.claude/agents` and `~/.claude/skills` and applies edits within seconds — no restart for those. `settings.json` resolves at session start, so **step 2 requires a restart before step 3**. Separately, agent definition edits do not reach dispatches made in the same session, so **step 5 requires a restart before step 6**, and **step 8 requires a restart before step 10**.

**4. Branch.** Work continues on `docs/agent-architecture-spec`, cut from `origin/main`. Never commit to `main`.

**5. Commit cadence.** One commit per step, Conventional Commits, scope `config`. Ten steps, ten commits. Do not batch.

---

## Blocker B1 — the §8.5 byte budget is unachievable as §5.2 is written

**This blocks step 8 only. Steps 1 through 7 and step 9 proceed unaffected.**

Check 8.5 requires `cat ~/.claude/rules/common/*.md ~/.claude/CLAUDE.md | wc -c` to return under 13,000. Measured against the six files §5.2 keeps:

| Component | Bytes |
|---|---:|
| `pillars.md` | 1,323 |
| `no-comments.md` | 1,459 |
| `no-direct-db-access.md` | 4,293 |
| `coding-style.md` | 1,402 |
| `security.md` | 1,605 |
| `memory-discipline.md` | 1,616 |
| **Six kept rules** | **11,698** |
| `CLAUDE.md`, today | 2,070 |
| **Subtotal, before a single byte is added** | **13,768** |
| Headroom to 13,000 | **−768** |

The new §5.3 delegation rule (~900 B) is not yet counted, and `CLAUDE.md` must still gain the §5.4 prohibition. The real overshoot at step 8 is roughly 1,700 bytes.

The check is also already looser than the goal it enforces: §1.2 targets ~2,520 tokens ≈ 10,080 bytes, while 8.5 admits 13,000. Both are missed.

**Three resolutions. The choice is the user's; do not pick one during execution.**

| # | Resolution | Result | Cost |
|---|---|---|---|
| R1 | Trim `no-direct-db-access.md` from 4,293 to ≤3,295 B in place | ~12,600 total | Edits a safety-critical file §5.2 marked KEEP |
| **R2** | **Split it: the prohibition (~800 B) stays always-on, the rationale and the paste-cycle workflow move into the existing `platform-engineer` skill** | **~10,500 total, ≈2,626 tokens — meets §1.2's target** | One more skill edit; changes a §5.2 row from KEEP to SPLIT |
| R3 | Raise the threshold in 8.5 and criterion c4 to 14,500 | Passes as-is | Abandons §1.2's stated objective; a tuned number replacing a missed one |

**Recommended R2.** It is the move §5.2 already makes five times — always-on prohibition stays, task-specific procedure becomes a skill — and `platform-engineer` is the skill the file's own §5.2 row names. It is the only option that meets §1.2 rather than redefining it.

---

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

The description must not name `fork` — check 8.14 greps `~/.claude/agents` for that word and the SPEC's own revision 2 draft of this block failed it.

### 5b. Frontmatter for the four retained agents (§3.4, §3.5)

| Agent | `model` | `maxTurns` | `skills:` | `tools` |
|---|---|---:|---|---|
| `code-reviewer` | explicit | 300 | `reviewing-code` | minimum viable, never omitted |
| `security-reviewer` | explicit | 300 | — | minimum viable |
| `conformance-auditor` | explicit | 300 | `conformance-auditor` | minimum viable |
| `researcher` | explicit | 300 | `research-citations` | minimum viable |

`tools` is always an explicit allowlist (S5) — omitting it inherits every tool available to subagents. `maxTurns` is always set (S6); the values are the measured circuit breakers from §3.5, not preferences.

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

**Goal.** The preamble shrinks last, once nothing depends on the moved content.

**→ B1 BLOCKS THIS STEP. Do not begin until the user has chosen R1, R2, or R3.**

### 8a. Delete seven files

`agents.md`, `delegation-discipline.md`, `git-workflow.md`, `writing-style.md`, `performance.md`, `patterns.md`, `hooks.md`.

`agents.md` carries the false claim at `:17` that caused the incident. Its accurate content — parallelism decided by shared state, and work-forcing fields — moves into the five agent bodies written at step 5, where it is actually needed.

### 8b. Confirm five files are already relocated

`testing.md`, `git/commits.md`, `git/branching.md`, `research-citations.md` moved to skills at step 4; `git/pull-requests.md` is already the `pr` skill. Delete the originals now, not before — step 4 is their new home and it must exist first.

### 8c. Write the §5.3 replacement

New file, replacing `delegation-discipline.md`. Content exactly:

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

### 8d. Add the §5.4 prohibition to `CLAUDE.md`

```markdown
No file in this configuration describes what Claude Code can or cannot do. Not its turn lifetime, not whether subagents survive, not what is delivered when, not what a tool returns. The harness describes itself at runtime, accurately, for free, and it updates without telling this repository.

Configuration states preferences, constraints, and facts about this project that the harness cannot know. Nothing else.
```

### 8e. Rewrite `CLAUDE.md`'s bullet list

Three bullets point at files deleted in 8a and 8b and must go or be rewritten:

| Current bullet | Action |
|---|---|
| "The main thread orchestrates and does not perform: delegate every code mutation…" ending `delegation-discipline.md` | **Replace** — it is the inverted default, and it is the single sentence this whole remediation exists to reverse |
| The `pull-requests.md` pointer | Repoint to the `pr` skill |
| The `cd` prefix bullet | Keep — it is a real harness-interaction constraint, not a capability claim |

**Verify.** `cat ~/.claude/rules/common/*.md ~/.claude/CLAUDE.md | wc -c` returns under 13,000 (closes c4 after B2's amendment). `grep -rniE 'harness property|is not supported|you cannot wait|children die|does not survive' ~/.claude/rules ~/.claude/agents ~/.claude/CLAUDE.md | wc -l` returns `0`.

**Halt if.** The byte count still exceeds the threshold after the chosen resolution — that means the resolution was mis-sized, and the answer is to re-measure, never to delete a seventh file on the spot.

**Commit.** `refactor(config): cut the always-on preamble and invert the delegation default`

**→ RESTART REQUIRED before step 10.**

---

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
| 8.2 | `grep -rl "does not survive" … \| wc -l` | `0` | — |
| 8.3 | `grep -L "^maxTurns:" ~/.claude/agents/*.md \| wc -l` | `0` | c3 |
| 8.4 | capability-claim grep | `0` | c2 |
| 8.5 | always-on byte count | `< 13000` | c4 |
| 8.6 | `/skill-doctor` report | captured before and after | c12 |
| 8.7 | no preloaded skill sets `disable-model-invocation: true` | `0` | c5 |
| 8.8 | `grep -c "1\. Entry invariant" ~/.claude/agents/*.md` | `1` per file | c9 |
| 8.9 | empty-diff dispatch halts | halts | c10 |
| 8.10 | hold gate fires | denied | c6 |
| 8.11 | task-output gate fires | denied | c7 |
| 8.12 | depth limit holds | no depth-2 agent | c8 |
| 8.13 | worktree isolation holds | two paths, no lock error | c11 |
| 8.14 | fork named nowhere in the routing surface | `0` | — |

**8.2 is redundant with 8.4** — `does not survive` is a substring 8.4's alternation already sweeps. Run both; the duplication costs nothing and removing it is not in scope.

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
- **No proof that the configuration is better.** §8 proves it is *applied*. §10.5 is explicit that improvement needs a comparable unit of work run afterwards, measured on agents per unit, wall-clock per unit, and peak main-thread context.
- **No change outside `~/.claude` and this checkout.**
