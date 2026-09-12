# SPEC: Agent architecture remediation

Status: proposed, not applied
Revision: 3 — supersedes revision 2 (fork removed as a routing vehicle; reviewer entry invariants require a resolvable standard; fork tripwire added at §8.14)
Revision 2 superseded revision 1 (brief-length gate removed, maker agent restored, circuit-breaker values measured)
Author: derived from the incident analysis of session `cfdbeee9` (77 subagents, 2026-09-11)
Target: `~/.claude` (symlinked into `SatanshuMishra/.windful-ocean`, PUBLIC repo)

---

## 0. How to read this spec

### 0.1 The binding rule

The incident was caused by a sentence in a config file that was false, stated with authority, and obeyed 55 times against contradicting runtime evidence. A remediation built from more sentences repeats the disease.

Therefore **every change in this spec carries an enforcement class**, and one rule governs the set:

> **No item of class A ships without a paired item of class S or M, or an explicit accepted-risk entry in §10.**

### 0.2 Enforcement classes

| Class | Meaning | Can it be disobeyed? |
|---|---|---|
| **S — Structural** | The wrong option ceases to exist. A deleted file, a denied type, a depth limit. | No. There is nothing to disobey. |
| **M — Mechanism** | The harness blocks or bounds it at runtime. A `PreToolUse` hook, a `maxTurns` cap, a deny rule. | No. The call does not proceed. |
| **A — Advisory** | Prose in a rule, description, or skill body. Steers a model decision. | Yes, and it will be. |

Class A is not forbidden. It is *labelled*, and it never carries a load-bearing invariant alone.

### 0.3 The gate-shape rule

> **A correctness gate asserts a categorical property. Only a circuit breaker may carry a threshold, and it must be set where it never fires in normal operation.**

A categorical property is true or false of the thing itself: a command either contains `sleep` inside a loop or it does not. A threshold is a number chosen to fit scenarios that cannot be enumerated in advance; it fails in both directions and neither failure is visible.

This is not a new principle. `rules/common/testing.md` already states it: *"A pinned count or a sampled allowlist is forbidden — both are change-detectors wearing a census costume."* Revision 1 of this spec violated it with a 4,000-character brief-length gate. That gate is removed in revision 2; see §6.2.

Where a check cannot be made categorical, it becomes an **entry invariant**: an assertable statement the agent proves about itself, with a command and an exit code, before it proceeds.

### 0.4 Terms used in this spec

- **Main thread** — the session you type into.
- **Cold subagent** — a subagent started from a definition in `~/.claude/agents/`. Sees no conversation history. Must be told everything in its brief.
- **Fork** — the built-in `fork` subagent type. Inherits the entire conversation, including its system prompt and any loaded skills. Has no custom body of its own, no tool restriction, no model override, and no worktree. **This spec does not use it as a routing vehicle** (§2.1, §10.4); the term is retained only because §3.2 argues from what a fork cannot do.
- **Brief** — the `prompt` argument passed to the `Agent` tool. Written by the parent, and occupying the parent's context permanently.
- **Skill** — a `SKILL.md` directory. Its description is always in context; its body loads on invocation.

---

## 1. Intent

### 1.1 What is wrong now

| Measured | Value |
|---|---|
| Wall-clock spent in deliberate shell waits | 458 min of a 599 min session (86% of all Bash time) |
| Of that, waiting after the answer had already been delivered | 149 min |
| Completion notifications delivered and ignored | 143 |
| Cost of an agent that does nothing at all | 53,820 – 77,727 tokens |
| Declared cost of a dispatch in `delegation-discipline.md` | "~5-10k" |
| Cheapest real dispatch in the incident | 137,191 tokens |
| Briefs written by parents, occupying parent context | 124,101 tokens across 37 maker dispatches |
| Coordination layer (13 Leads) vs working layer (55 workers) | 701 min / 24.7M vs 547 min / 22.0M |
| Rework agents | 13 of 68, 221 min, 18% of all agent time |
| Always-on rule text sent to every agent | 51,740 bytes (~12,935 tokens) |
| Custom agent definitions | 13 |

### 1.2 What this spec changes it to

1. **Main works by default.** Delegation becomes the exception that needs a reason, so a routing mistake fails toward the cheap, correct path.
2. **Procedure lives in skills, not in agent bodies.** A skill loads on demand, and is injected into a cold subagent only where that agent's `skills:` field declares it. An agent body is paid for on every dispatch whether or not it is relevant.
3. **The roster shrinks from 13 to 5.** Thirteen types is thirteen available wrong routing answers.
4. **The three measured pathologies are blocked by categorical hooks**, not discouraged by prose.
5. **The always-on preamble drops from ~12,935 to ~2,520 tokens.**
6. **Two vehicles only: main and cold subagent.** The configuration behaves identically in the CLI and the desktop app, because it cannot express a route that exists on only one of them (§2.1).

### 1.3 Explicit non-goals

- This spec does not aim to make the model route perfectly. Routing is a model decision and cannot be made deterministic. It aims to make misrouting cheap and loud.
- This spec does not reduce total token spend as its primary objective. It reduces main-thread context occupancy, wall-clock, and the cost of being wrong.

---

## 2. Conflict register: course material vs documentation

The user directed that documentation wins where the two disagree. Four conflicts were found and resolved. **Each resolution is load-bearing for a later section.**

| # | Course says | Docs say | Resolution | Affects |
|---|---|---|---|---|
| C1 | `allowed-tools` "restricts which tools Claude can use when the skill is active — no editing, no writing" | "It does **not** restrict which tools are available: every tool remains callable" — [skills.md](https://code.claude.com/docs/en/skills.md) | `allowed-tools` is a **pre-approval**, not a guardrail. The grant clears at the next user message. | §7.2, §10.1 |
| C2 | `name` is a required skill frontmatter field | "All fields are optional. Only `description` is recommended." `name` defaults to the directory name | `name` optional; still set it for legibility | §7.2 |
| C3 | "Always restart Claude Code for changes to take effect" | Claude Code watches `~/.claude/agents/`; edits apply within seconds, restart needed only for a newly created scope directory, `--add-dir` paths, and `--disable-slash-commands` sessions — [sub-agents.md](https://code.claude.com/docs/en/sub-agents.md) | No blanket restart. Restart only for the three named cases | §9 |
| C4 | Skills vs subagents framed as knowledge vs isolation | Docs add a third option the course omits entirely: the **`fork` subagent type**, which inherits the conversation | Fork exists, and the docs are right that the course omits it. It is **not** used as a routing vehicle here: it is gated server-side and cannot be relied on (§2.1) | §3.2, §10.4 |

**C1 is the most dangerous.** Building a "read-only skill" on `allowed-tools` would create a guardrail that does not hold — a new instance of the exact failure this spec exists to remove.

### 2.1 Environment fact, probed

| | Incident session | Desktop Code tab |
|---|---|---|
| `entrypoint` | `cli` | `claude-desktop` |
| `fork` type available | Yes | No — dispatch returns `Agent type 'fork' not found` |

**Availability is a server-side feature flag, not an entrypoint check.** The binary carries `isForkSubagentEnabled` and `tengu_fork_subagent_enabled`; `tengu_` is Claude Code's internal feature-gate namespace. No `CLAUDE_CODE_FORK_SUBAGENT` in the environment, no `fork` key in any settings file, and no local statsig cache holds or overrides the value. There is no local override in either direction.

Probed 2026-09-11, desktop app 1.52386.3, claude-code 2.1.266. The earlier self-test — "if the Agent tool offers `run_in_background`, fork mode is off" — is withdrawn: it was an inference from two surfaces, and a direct dispatch attempt is categorical.

Three consequences:

1. Fork cannot be switched on in the desktop app.
2. It cannot be switched off in the CLI to force parity downward.
3. It can flip either way with no release and no config change, and nothing in this repository would see it move.

**Therefore no rule in this configuration names fork as a route.** Such a rule would be a prose claim about a flag that cannot be read or set from here — the exact class of cached capability statement §5.4 prohibits. The user works in both the CLI and the desktop app and requires identical configuration behaviour on both; two vehicles, main and cold subagent, is the only arrangement where parity is a property of what the configuration can express rather than a behaviour asked of the model. See §5.3, §10.4, and the check at §8.14.

---

## 3. Agent roster

### 3.1 Decisions

Current roster is 13. Target is 5: four read-only, one maker.

| Agent | Action | Class | Intent |
|---|---|---|---|
| `delivery-lead` | **DELETE** | S | Removes the middle layer that cost more than the workers (701 vs 547 agent-min, 24.7M vs 22.0M tokens). Orchestration is step-dependent work and belongs in the thread that holds the context. |
| `architect` | **DELETE** | S | Design reasoning is the most step-dependent work there is. `superpowers:brainstorming` and `superpowers:writing-plans` already exist. |
| `investigator` | **DELETE** | S | Debugging is step-dependent by definition. `superpowers:systematic-debugging` already exists. |
| `verifier` | **DELETE** | S | The documented test-runner anti-pattern: it compresses the output you need for diagnosis into a verdict. The `verification-discipline` skill already exists. |
| `technical-writer` | **DELETE** | S | Expert-persona anti-pattern. Claude writes documentation without being told it is a writer. |
| `release-engineer` | **DELETE** | S | Expert-persona plus procedure. The `pr` skill and `pr.mjs` tool already carry the real mechanism. |
| `implementer` | **COLLAPSE → `machinist`** | S | Three personas of one job. See §3.3. |
| `test-engineer` | **COLLAPSE → `machinist`** | S | Procedure moves to the `writing-tests` skill (§4.1) |
| `platform-engineer` | **COLLAPSE → `machinist`** | S | The `platform-engineer` **skill already exists** and carries the procedure; its safety constraint lives in `no-direct-db-access.md`, which stays always-on |
| `code-reviewer` | **KEEP** | — | Fresh-eyes review is endorsed by both docs and course: Claude reviews code better when it did not write it. |
| `security-reviewer` | **KEEP** | — | Same rationale, different lens. Parallelises with `code-reviewer` at no shared-state cost. |
| `conformance-auditor` | **KEEP** | — | Read-only fresh-eyes audit. Its duplicate skill is retained and **preloaded via `skills:`**. |
| `researcher` | **KEEP, narrowed** | — | External web research is the canonical subagent case and needs tools Explore lacks. Narrowed to external research only; codebase search routes to the built-in `Explore`, which skips CLAUDE.md and therefore costs roughly a quarter as much. |

Six deletions, three collapsed into one, four retained.

### 3.2 Why these five

The four read-only agents are **fresh-context, result-only**. Each satisfies the decision rule from both sources: the intermediate work genuinely does not matter to the caller, and each does something the main thread cannot — sees the diff without having written it, or explores the open web without polluting the conversation.

**`machinist` is the one maker, and it exists because three capabilities are available only to a cold subagent.** Each is stated below against a fork, which is the nearest alternative vehicle — this is the one place fork still appears in the spec, and the argument holds whether or not fork is reachable (§2.1):

| Capability | Why it matters here |
|---|---|
| `isolation: worktree` | A fork has no frontmatter and therefore no separate checkout. This is the mechanism that replaces the prose rule at `delivery-lead.md:43` about two makers colliding on one git index. |
| A cheaper model | A fork of an Opus session is Opus. The docs name model routing as a primary subagent benefit: "control costs by routing tasks to faster, cheaper models." |
| Tool restriction | A fork inherits everything main has. |

No survivor claims expertise as its reason to exist. `machinist` is named for **how it works** — to a finished drawing, adding no design judgment — not for what it knows. That distinction is the line between a legitimate role and the expert-persona anti-pattern.

### 3.3 `machinist`

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

The third precondition is the sequential-pipeline test, stated as something checkable before dispatch rather than discovered after three rework rounds.

**Entry invariant** (§6.2): before its first edit, `machinist` asserts that its brief names every file it will touch, and halts if it does not. A brief that cannot name its targets was not fully specified, which means the dispatch was wrong.

### 3.4 Required frontmatter for all five

| Field | Required by this spec | Intent | Class |
|---|---|---|---|
| `description` | Yes | States the **precondition** and an explicit "do NOT use" clause. A job title always matches a request; a precondition sometimes fails to. | A |
| `tools` | Yes, explicit | Minimum viable list. Never omitted — omission inherits every tool available to subagents. | M |
| `model` | Yes, explicit | Removes dependence on inheritance order; on `machinist` it is also the cost lever. | S |
| `maxTurns` | Yes | Circuit breaker. See §3.5. | M |
| `isolation` | On `machinist` only | Makes concurrent makers safe structurally instead of by prose | M |
| `skills` | Where a procedure exists | Preloads full skill content at startup so procedure is not duplicated in the body | S |

**Constraint on `skills`:** a skill with `disable-model-invocation: true` **cannot** be preloaded into a subagent. Any skill named in a `skills:` field must therefore leave that field unset or false. Checked in §8.7.

**Constraint on descriptions:** combined descriptions of all non-builtin subagents must stay under 15,000 tokens or Claude Code warns at startup. Five agents at roughly 60 words each is far inside that. Detail belongs in the body, which loads only on dispatch.

### 3.5 Circuit-breaker values, measured

`maxTurns` is a **threshold**, and under §0.3 a threshold is permitted only as a circuit breaker set where it never fires in normal operation. Values are derived from the incident, not chosen.

| Group | Observed max (legitimate) | p90 | Median | `maxTurns` | Headroom over observed max |
|---|---:|---:|---:|---:|---:|
| Read-only (reviewers, auditor) | 115 | 104 | 69 | **300** | 2.6× |
| `researcher` | 82 | — | — | **300** | 3.7× |
| `machinist` | 598 | 283 | 154 | **800** | 1.3× |

The runaway that motivated the cap ran **1,184 turns**. Every value above catches it and none fires on observed legitimate work. The `researcher` sample is thin (n=2) and is set to the read-only value rather than derived.

When a subagent hits the cap, Claude Code returns its output marked partial and notes that it can be resumed — so the breaker degrades to a pause, not a loss.

---

## 4. Skills to create

Each new skill exists because a deleted or collapsed agent carried a procedure worth keeping. **An agent whose only content was a persona produces no skill** — that content is discarded, not migrated.

| # | Skill | Source | Why it survives as a skill |
|---|---|---|---|
| 4.1 | `writing-tests` | `test-engineer.md` body + `rules/common/testing.md` | Real, specific procedure: the admission gate, scoped TDD, the red-proof, the inertness mutation. Needed only when writing tests, which is why it should not be always-on. Preloaded into `machinist`. |
| 4.2 | `committing-work` | `rules/common/git/commits.md` + `git/branching.md` | Format and cadence. Task-specific. Preloaded into `machinist`. |
| 4.3 | `reviewing-code` | `code-reviewer.md` body | Preloaded into `code-reviewer` via `skills:`, so the body shrinks to role, entry invariant, and output format. |
| 4.4 | `research-citations` | `rules/common/research-citations.md` | Only relevant when producing a research deliverable. Preloaded into `researcher`. |

Not created, and why:
- **Implementation procedure** — `implementer.md` contains no procedure that is not either a Three Pillars restatement or generic coding advice. Discarded.
- **Documentation procedure** — persona only. Discarded.
- **Release procedure** — the `pr` skill already exists, enforced by `pr.mjs` plus a deny gate.
- **Migration procedure** — the `platform-engineer` skill already exists, and is preloaded into `machinist`.
- **Verification procedure** — the `verification-discipline` skill already exists.

---

## 5. Rules: the always-on preamble

### 5.1 Intent

Every byte here is sent to the main thread and to every cold subagent, verbatim, on every dispatch. This was verified empirically: a probe agent quoted all 18 `rules/common` files back verbatim without using a single tool. The claim in `agents.md` that this happens is one of the few capability claims in the config that is **true**.

The cost is therefore real and multiplied. Only content that is a genuine invariant across all work earns a place.

### 5.2 Disposition of every file

| File | Bytes | Action | Class | Intent |
|---|---|---|---|---|
| `pillars.md` | 1,323 | **KEEP** | — | Genuine cross-cutting tie-break |
| `no-comments.md` | 1,459 | **KEEP** | — | Applies to every file touched |
| `no-direct-db-access.md` | 4,293 | **KEEP** | — | Safety-critical, irreversible if violated; carries the constraint that justified `platform-engineer` |
| `coding-style.md` | 1,402 | **KEEP** | — | Applies to every edit |
| `security.md` | 1,605 | **KEEP** | — | Applies to every commit |
| `memory-discipline.md` | 1,616 | **KEEP** | — | Governs writes to a persistent store; cheap and genuinely always-on |
| `agents.md` | 3,971 | **DELETE** | S | Contains the false claim at `:17` that caused the incident. Its accurate content (parallelism by shared state, work-forcing fields) moves into the five agent bodies where it is actually needed. |
| `delegation-discipline.md` | 3,497 | **DELETE and replace** | S | Its mandate to delegate every mutation is what makes misrouting the compliant behaviour. Replaced by §5.3. |
| `testing.md` | 6,668 | **MOVE to skill** §4.1 | S | Only relevant when writing tests |
| `git/commits.md` | 2,561 | **MOVE to skill** §4.2 | S | Only relevant when committing |
| `git/branching.md` | 327 | **MOVE to skill** §4.2 | S | Merged into the same skill |
| `git/pull-requests.md` | 5,216 | **MOVE** — already the `pr` skill | S | Duplication |
| `git-workflow.md` | 1,840 | **DELETE** | S | A hub that points at spokes; pure indirection cost |
| `research-citations.md` | 1,460 | **MOVE to skill** §4.4 | S | Only relevant to research deliverables |
| `writing-style.md` | 3,936 | **DELETE** | S | The output style already binds the main thread; agents carry their own answer format |
| `performance.md` | 5,984 | **DELETE** | S | Names model versions that have moved on, and its central advice (background long commands) is now harness default |
| `patterns.md` | 1,022 | **DELETE** | S | Generic design-pattern content Claude already has. Textbook expert-claim content. |
| `hooks.md` | 1,490 | **DELETE** | S | Describes the harness to itself — the exact class of content §5.4 forbids |

### 5.3 The replacement for `delegation-discipline.md`

The old file mandated delegation of every code mutation "including a one-line typo fix, at a known ~5-10k-token round-trip cost." The measured floor is 137,191 tokens — 14 to 27 times the declared figure.

The replacement inverts the default. Its full intended content:

> **Delegation**
>
> The main thread does the work. Delegation is the exception, and it needs a reason from this list:
>
> 1. A diff exists and needs review by something that did not write it.
> 2. A question needs external web research.
> 3. Exploration would read many files whose contents will never be referenced again.
> 4. A fully specified change touches enough files to flood this conversation, and no step of it depends on what an earlier step finds.
>
> If none of those hold, do the work here.
>
> Everything a dispatched agent needs must be addressable without this conversation: a path, a commit range, or a question. Work that can only be described by referring to what has already happened here is work that stays here.

Class: **A**, recorded in §10.1. The four reasons map one-to-one onto the five retained agents, so the roster itself is the structural half of the pairing: there is no agent to dispatch for a reason not on the list.

The addressability clause is structural for the same reason. Every retained agent's entire input is a path, a commit range or a question (§6.2): a diff for the two reviewers, two resolvable paths for `conformance-auditor`, a question for `researcher`, an enumerated file list for `machinist`. The three agents whose work was inherently step-dependent — `delivery-lead`, `architect`, `investigator` — are deleted by §3.1 and their work returns to main. **There is no agent left to dispatch step-dependent work to**, so the clause is class **S** in effect: the wrong option does not exist rather than being discouraged.

### 5.4 Standing prohibition on capability claims

Added to `CLAUDE.md`. Class **A**, paired with the check in §8.4.

> No file in this configuration describes what Claude Code can or cannot do. Not its turn lifetime, not whether subagents survive, not what is delivered when, not what a tool returns. The harness describes itself at runtime, accurately, for free, and it updates without telling this repository.
>
> Configuration states preferences, constraints, and facts about *this project* that the harness cannot know. Nothing else.

**Intent:** a capability claim is a cached fact about a system that updates independently, with no expiry mechanism and no way for an agent to falsify it from inside. `agents.md:17` was such a claim. It was wrong, and it beat the harness's own contradicting message 55 times to zero, because configuration is framed as law and tool output as data.

---

## 6. Mechanisms

This is the section that does the work. Everything above is arrangement; this is enforcement.

### 6.1 Depth limit

```json
{ "env": { "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "1" } }
```

**Class: S.** Categorical — "no nesting" is a structural constant, not a tuned number. At the depth limit Claude Code withholds the `Agent` tool from every subagent. A three-level architecture becomes unbuildable rather than discouraged. This alone makes `delivery-lead` unresurrectable even if the file returns.

Documented default is 3 layers.

### 6.2 Entry invariants (replaces revision 1's brief-length gate)

**Revision 1 proposed denying any `Agent` dispatch whose brief exceeded 4,000 characters. That gate is removed.** It was a pinned count — the shape `rules/common/testing.md` already forbids. It would have denied a legitimate self-contained brief carrying an exact SQL block, and passed a 3,900-character brief that re-explained the entire conversation, with neither failure visible.

It was also largely redundant. The briefs that ran 14,000–20,855 characters were written for the nine agents this spec removes. Once the roster is cut, no retained agent needs a long brief.

**What replaces it: each agent proves its own precondition before proceeding.** Class **M** by construction — the assertion is a command with an exit code, and the agent halts on failure rather than reporting it.

| Agent | Entry invariant | Proof |
|---|---|---|
| `code-reviewer` | A diff exists that this agent did not write, **and every standard named in the brief resolves to a path** | `git diff --stat <base>..HEAD` non-empty, output quoted; each named standard `test -f` exit 0, path quoted |
| `security-reviewer` | Same | Same |
| `conformance-auditor` | A named standard and a named artifact both resolve to real paths | both `test -f` exit 0, both paths quoted |
| `researcher` | The question requires a source outside this repository | names the source before searching |
| `machinist` | The brief names every file to be touched | enumerate them, count them, and halt if the brief named none |

The invariant is the **first field of the output contract** (§7.1, rule S4). It cannot be filled without running the check, and a failed check is a halt with a stated reason, not a finding.

**On the reviewer clause.** The wording is *every standard **named in the brief***, and that is load-bearing. A brief naming no standard passes and a general-quality review proceeds, because a review with no named standard genuinely is a review against the always-on rules in §5.2, which the subagent receives verbatim (§5.1). The clause fires only on a named criterion that resolves to nothing — a brief such as "review this against the approach we settled on for auth", whose criteria exist only in the calling conversation. Without the clause that dispatch passes the diff check and the agent reviews against invented standards, which is the re-brief loop §6.6 exists to close, re-entered through the only door the two-vehicle model leaves open. The vacuous pass is correct semantics here rather than a gap in the census.

Known limit: §8.8 checks that `1. Entry invariant` appears once per agent file. It does not check what the invariant says, so this clause is enforced at runtime by the halt and is unaudited in the body.

### 6.3 Hold-loop gate

**Class: M.** Categorical. `PreToolUse` matching `Bash`, denying when the command contains `sleep` **and** any of `while`, `until`, or `for `.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "~/.claude/hooks/deny-hold-loop.sh" } ] }
    ]
  }
}
```

Deny reason:

> Hold loops are denied. A subagent's result is delivered to you automatically when it completes, and arrives whether you are idle or not. End your turn instead of holding it open.

**Intent.** Directly targets the 458 measured minutes. A bare `sleep 5` still passes; only loops are blocked, and all 116 measured hold calls were loops. The reason text states the true harness behaviour at the moment of the mistake, which is the only place a correction reliably lands.

### 6.4 Task-output read gate

**Class: M.** Categorical. `PreToolUse` matching `Read`, denying when `tool_input.file_path` matches `/tasks/[^/]*\.output$`.

**Intent.** One agent read task output files 951 times, one of them 224 times, consuming 314.7M cache-read tokens — 31% of the whole session. The harness already instructs against this in every dispatch result ("Do NOT Read or tail this file"). The instruction was ignored. This makes it impossible.

### 6.5 Transitional deny rules

**Class: M.** Until §9 step 1 is applied and verified:

```json
{ "permissions": { "deny": [
    "Agent(delivery-lead)", "Agent(implementer)", "Agent(test-engineer)",
    "Agent(platform-engineer)", "Agent(verifier)", "Agent(architect)",
    "Agent(investigator)", "Agent(technical-writer)", "Agent(release-engineer)" ] } }
```

Removed once the files are gone, since a deleted definition needs no deny rule.

### 6.6 Acceptance criteria become commands

**Class: A, paired with §8.**

The 13 rework agents and 221 wasted minutes were triggered by prose verdicts — "3 MEDIUM and 5 LOW" — which require judgment, which requires context, which a fresh agent lacks, which forces a new brief and another round.

Every retained reviewer's output format therefore ends with a machine-checkable line, not a severity tally:

> `BLOCKING: <command that must exit 0 before this ships>` or `BLOCKING: none`

A command exits 0 or it does not. There is nothing to interpret and no round three.

The old `delegation-discipline.md` already said this — a result you cannot trust "is fixed by shipping the acceptance criterion as a re-runnable check, never by adding a review round." The rule was correct and the check was never built.

---

## 7. Authoring standards

Binding on every agent and skill this spec creates or modifies.

### 7.1 Subagent authoring standard

| # | Rule | Source | Class |
|---|---|---|---|
| S1 | `description` states the precondition and an explicit "do NOT use when" clause | Course: description controls both *when* it launches and *what it is told* | A |
| S2 | Body defines an explicit **output format** with numbered sections | Course: "the single most important improvement you can make to a subagent" — it creates the stopping point that prevents overrun | A |
| S3 | Output format includes an **Obstacles Encountered** section | Course: without it the main thread rediscovers the same workarounds | A |
| S4 | The **first** output field is the entry invariant from §6.2, with its command and exit code; every other section carries at least one work-forcing field — a count, an ordered enumeration, a verbatim quote | Measured: a probe answered three yes/no questions in under two seconds having scanned nothing; the same questions as "count, then list, then quote" produced a correct answer | M for the first field, A for the rest |
| S5 | `tools` is an explicit minimum-viable allowlist, never omitted | Docs: omission inherits every available tool | M |
| S6 | `maxTurns` is always set, as a circuit breaker per §3.5 | Docs: returns partial, resumable output at the cap | M |
| S7 | Procedure arrives via `skills:`, never duplicated into the body | Docs: full skill content is injected at startup | S |
| S8 | Body carries role, entry invariant, output format, and stop conditions only | Keeps the per-dispatch cost proportionate | A |
| S9 | Any gate an agent applies asserts a categorical property; a threshold appears only as a circuit breaker with its measured basis stated | §0.3 | A |

### 7.2 Skill authoring standard

| # | Rule | Source | Class |
|---|---|---|---|
| K1 | Lives at `~/.claude/skills/<name>/SKILL.md` — exact filename, inside a named directory, never at the skills root | Course troubleshooting | S |
| K2 | `description` answers both "what does it do" and "when should Claude use it", key use case **first** | Docs: `description` + `when_to_use` truncate at 1,536 characters in the listing | A |
| K3 | `when_to_use` carries trigger phrases in the words a request actually uses | Course: non-triggering is almost always a description problem | A |
| K4 | SKILL.md stays under 500 lines; overflow goes to `references/`, `scripts/`, `assets/` with explicit load-when instructions | Course: progressive disclosure | A |
| K5 | Scripts are **run, not read** — the skill says so explicitly | Course: only the output consumes tokens | A |
| K6 | `allowed-tools` is **never** used as a restriction | **Docs, conflict C1**: it pre-approves and does not restrict; every tool stays callable | S |
| K7 | `disable-model-invocation: true` on any skill with side effects the user should time | Docs | M |
| K8 | A skill named in any agent's `skills:` field must not set `disable-model-invocation: true` | Docs: that flag blocks preloading | M |
| K9 | `context: fork` only on skills carrying an actionable task, never on guidelines | Docs warning: a guidelines-only fork returns nothing useful | A |
| K10 | Descriptions across the skill set must be mutually distinct | Course: overlapping descriptions cause the wrong skill to fire | A |

### 7.3 Cost discipline for skills

Every skill in the listing costs context on **every turn**, used or not. `/skill-doctor` reports per-skill cost and usage frequency. §8.6 makes running it part of acceptance.

---

## 8. Acceptance checks

Each is a command producing a value, not a judgment. The spec is applied when all pass.

| # | Check | Command | Expected |
|---|---|---|---|
| 8.1 | Roster is five | `ls ~/.claude/agents/*.md \| wc -l` | `5` |
| 8.2 | The false claim is gone everywhere | `grep -rl "does not survive" ~/.claude/agents ~/.claude/rules ~/.claude/CLAUDE.md \| wc -l` | `0` |
| 8.3 | Every agent has a circuit breaker | `grep -L "^maxTurns:" ~/.claude/agents/*.md \| wc -l` | `0` |
| 8.4 | No capability claims remain | `grep -rniE "harness property\|is not supported\|you cannot wait\|children die" ~/.claude/rules ~/.claude/agents ~/.claude/CLAUDE.md \| wc -l` | `0` |
| 8.5 | Always-on budget | `cat ~/.claude/rules/common/*.md ~/.claude/CLAUDE.md \| wc -c` | `< 13000` |
| 8.6 | Skill cost measured | `/skill-doctor` | report captured, before and after |
| 8.7 | No preloaded skill blocks preloading | for each name in any `skills:` field, `grep -c "disable-model-invocation: *true" ~/.claude/skills/<name>/SKILL.md` | `0` |
| 8.8 | Every agent's first output field is its entry invariant | `grep -c "1\. Entry invariant" ~/.claude/agents/*.md` | `1` per file |
| 8.9 | Entry invariant halts on failure | dispatch `code-reviewer` on a branch with an empty diff | halts naming the empty diff; produces no review |
| 8.10 | Hold gate fires | `Bash("i=0; until [ $i -ge 3 ]; do sleep 1; i=$((i+1)); done")` | denied |
| 8.11 | Task-output gate fires | `Read` on any `…/tasks/x.output` | denied |
| 8.12 | Depth limit holds | dispatch an agent instructed to dispatch its own child | child dispatch fails; no depth-2 agent appears in `subagents/*.meta.json` |
| 8.13 | Worktree isolation holds | dispatch two `machinist` agents concurrently | two distinct worktree paths; no index-lock error |
| 8.14 | Fork is named nowhere in the routing surface | `grep -rniE '\bfork' ~/.claude/rules ~/.claude/agents ~/.claude/CLAUDE.md \| wc -l` | `0` |

**8.9 through 8.13 are the ones that matter.** They test mechanisms. The rest test arrangement.

**8.14 measured `0` on 2026-09-11, before any change**, across rules, agents, `CLAUDE.md` and also the skills tree, and individually across all six rules files §5.2 keeps. Fork routing exists only in this document, which lives outside `~/.claude`, so 8.14 is a tripwire against a future addition rather than a cleanup: it lands green with no remediation attached. It is a closed census over one word, not a list of phrasings — a pattern list would be the sampled allowlist §0.3 forbids, and a new phrasing would evade it.

**Why `~/.claude/skills` is outside 8.14's scope**, despite measuring `0` there today. K9 permits `context: fork` on a skill carrying an actionable task, which is a skill execution mode rather than a routing choice. A bare-word census over the skills tree would forbid a field this spec's own authoring standard allows, and the only way to keep the wider scope would be a phrasing exception — the allowlist shape §0.3 forbids. Scope stops at the routing surface, where the word has exactly one meaning.

**Open, not resolved here:** whether `context: fork` on a skill is gated by the same server-side flag as the `fork` subagent type (§2.1). If it is, a skill using it behaves differently across the two surfaces and K9 needs the same treatment §11 gives the subagent type. Untested; stated rather than assumed.

---

## 9. Application order

Ordered so each step is independently safe and reversible, and so no window exists where enforcement is absent.

| Step | Action | Rationale for position |
|---|---|---|
| 1 | Apply §6.5 transitional deny rules | Stops the nine outgoing agents being dispatched before their files are touched |
| 2 | Apply §6.1 depth limit and §6.3–6.4 hooks | Mechanisms live before any prose changes, so the window is never unprotected |
| 3 | Verify 8.10–8.12 | Mechanisms confirmed working before anything is deleted |
| 4 | Create the four skills in §4 | Procedure exists before its agent is removed |
| 5 | Write `machinist`; rewrite the four retained agents to §3.4 with §6.2 entry invariants | They reference the skills from step 4 |
| 6 | Verify 8.9 and 8.13 | The new agent and the invariants work before the old ones go |
| 7 | Delete the nine outgoing agent files | Their replacements are live |
| 8 | Apply §5.2 rule dispositions and §5.3 replacement | Preamble shrinks last, once nothing depends on the moved content |
| 9 | Remove §6.5 deny rules | Deleted files need no deny rule |
| 10 | Run all of §8 | Full acceptance |

**On restart (conflict C3):** Claude Code watches the agents and skills directories and applies edits within seconds. A restart is required only when creating a scope's *first* file in a directory that did not exist at session start. Since `~/.claude/agents/` and `~/.claude/skills/` both already exist, **no restart is required by this spec** except after step 2, because settings and hooks resolve at session start.

---

## 10. Accepted risks and known-soft items

Listed because §0.1 requires every class-A item to be either paired with a mechanism or recorded here.

### 10.1 Routing cannot be made deterministic

Which vehicle Claude picks — main or cold subagent — is a model decision steered by descriptions. §5.3 biases the default toward the cheap option and §6.2 makes a wrong dispatch halt loudly at its first action, but **nothing mechanically prevents a cold dispatch that should have stayed in main.**

Revision 1 proposed a brief-length gate for this. It was removed as a pinned count (§0.3, §6.2), and no categorical replacement exists: "does this brief re-explain context the parent already holds" is not a property of the brief's text.

**Accepted because** the default changed and the roster shrank. A misroute now fails toward "main did it itself", which is cheap and usually right, or toward a halted agent with a stated reason, which costs one turn. The reason misrouting hurt in the incident was that every wrong choice cost ~58,000 tokens plus a ~4,000-token brief plus a possible rework loop, not that routing was hard.

### 10.2 Output-format compliance beyond the first field is advisory

S2, S3 and the non-invariant half of S4 shape what an agent returns. Nothing enforces honest completion. The partial mitigation is that a work-forcing field cannot be filled without doing the work, which makes a careless answer visible to the agent writing it.

### 10.3 `maxTurns` is a threshold

Admitted under §0.3 rather than hidden. It is permitted as a circuit breaker, its values are measured (§3.5) rather than chosen, and the failure mode is a partial resumable return rather than a loss. If a legitimate agent ever hits one, the value is wrong and gets re-derived — not overridden case by case.

### 10.4 Dropping fork costs main-thread context on the CLI

Fork is not used as a route (§2.1). The cost of that is real and is accepted: §1.3 names main-thread context occupancy as this remediation's primary objective, and fork was the only vehicle that reduced it without a re-typed brief. On the CLI, step-dependent high-volume work now stays in main, and the fallback when main fills is harness summarization — a fidelity loss rather than a failure, and one with no structural fix.

**Accepted because** the cost is bounded and parity is worth more. High volume is nearly always many-file reading or many-file writing, and both have cold vehicles whose input is addressable without the conversation: `Explore` takes a question, `machinist` takes a file list. What remains in main is reasoning, which is low-volume. Fork's cell was "high volume **and** step-dependent", and those two properties rarely co-occur once reads and writes are routed out.

The residual is step-dependent discovery, such as debugging where each move depends on the last finding. It stays in main and consumes context. Its mitigation is not a subagent: the project ledger survives compaction, and `superpowers:systematic-debugging` loads on demand without a dispatch.

The alternative was to route on fork where available. Rejected because the same configuration would then behave differently on the two surfaces the user works in daily, and would drift further whenever the server-side gate moved.

### 10.5 This spec cannot verify its own effect

The incident session was still running during analysis and its totals moved (68 to 77 agents, 348 to 458 minutes of waiting). Post-change measurement requires a comparable unit of work run under the new configuration. **§8 proves the configuration is applied; it does not prove the configuration is better.** The comparison to run afterwards: agents per unit of work, wall-clock per unit, and peak main-thread context.

---

## 11. What this spec deliberately does not do

- **Does not add a router agent or a routing skill.** That would be a new class-A layer for a decision §10.1 admits cannot be made deterministic.
- **Does not keep a Lead in reduced form.** A depth of 1 makes the layer impossible; a reduced Lead would reintroduce a sequential pipeline stage at the point where context continuity matters most.
- **Does not delete the maker vehicle.** Revision 1 did, and it was wrong: worktree isolation, model routing and tool restriction are available only to a cold subagent. `machinist` keeps the vehicle and drops the three personas.
- **Does not rewrite the deleted agents as skills one-for-one.** Five carried personas or duplicated existing skills. Only four procedures survived the cut, in §4.
- **Does not set token budgets as rules.** A budget in prose is class A with no mechanism. The budget is enforced by the roster size and the preamble cut, both class S.
- **Does not gate on any tuned number outside §3.5.** Every other check in §6 asserts a categorical property.
- **Does not use the `fork` subagent type as a routing vehicle.** It is gated server-side (§2.1), so a rule naming it would be a claim about a flag this configuration can neither read nor set. Fork survives in §3.2 only as the contrast that justifies `machinist`, an argument that holds whether or not fork is reachable.
