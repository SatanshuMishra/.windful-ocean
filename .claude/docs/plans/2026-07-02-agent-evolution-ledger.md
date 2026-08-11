# Agent Evolution Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global, file-based telemetry-and-audit system that records generalist-agent fallbacks, permission failures, and agent inefficiencies, then clusters them into capability gaps and recommends anti-sprawl roster changes on manual demand.

**Architecture:** Cheap capture hooks append JSON events to an append-only daily log under `~/.claude/agent-ledger/`. A manual audit skill replays the log into a derived read-model (gaps + per-agent baselines), applies a Rule-of-Three gate and a three-part anti-sprawl gate, and emits a cited report. Resolutions are new events, never mutations.

**Tech Stack:** POSIX sh hooks, Python 3 (parse/build capture events), Node.js ESM `.mjs` (transcript analysis, index, gate, resolve), JSONL storage, `jq` for queries, the repo's `_assert.sh` test harness.

## Global Constraints

- Target is `$HOME/.claude` (global config). It is NOT a git repository — where a normal flow says "commit", instead run the task's tests and stop for review (the "Checkpoint" step). Do not run git.
- Platform is darwin. `flock` is unavailable — concurrency safety relies on atomic append of one line < `PIPE_BUF` (~4KB). Every event line MUST stay small: text excerpts capped at 500 chars, candidate lists capped at 5.
- NEVER write code comments in any file (global rule). Shebangs are allowed (functional).
- NEVER use emojis in any file.
- Data root is `${AGENT_LEDGER_DIR:-$HOME/.claude/agent-ledger}`. Tests set `AGENT_LEDGER_DIR` to a `mktemp -d` directory so they never touch real data.
- `AGENT_LEDGER_SUPPRESS=1` disables all capture (used by audit-time subagent spawns and by tests that must not log).
- Every event carries `schema_version: 1` and an ISO-8601 UTC `ts`.
- Hooks under `hooks/`, rule under `rules/`, and `CLAUDE.md` / `settings.json` are guarded by `protect-claude-config.sh` — editing them raises a confirm prompt by design; accept it.
- New hook scripts live in `hooks/agent-ledger/`. Node scripts are ESM `.mjs`; capture hooks are Python invoked as `python3 <path>`.
- Tests live in `hooks/tests/agent-ledger/*.test.sh` and source `../_assert.sh`.

---

## File Structure

Created:
- `rules/common/agent-roster.md` — anti-sprawl doctrine + the two model conventions.
- `hooks/agent-ledger/_ledger.py` — Python shared: root, events_file, append_event, cap, redact.
- `hooks/agent-ledger/_ledger.mjs` — Node shared: root, eventsFile, appendEvent, now.
- `hooks/agent-ledger/agent-fallback-capture.py` — PreToolUse(Agent) capture + soft nudge.
- `hooks/agent-ledger/agent-permission-capture.py` — PermissionDenied capture.
- `hooks/agent-ledger/agent-run-analyzer.mjs` — SubagentStop transcript analysis + capability-blocked scan.
- `hooks/agent-ledger/roster-index-gen.py` — scans agents/*.md into roster-index.json.
- `hooks/agent-ledger/agent-ledger-index.mjs` — replay log into gaps.json + baselines + checkpoint; clustering + Rule-of-Three.
- `hooks/agent-ledger/agent-roster-gate.mjs` — pure anti-sprawl verdict function.
- `hooks/agent-ledger/agent-ledger-resolve.mjs` — apply a resolution: lifecycle events + index + gap markdown.
- `skills/agent-gap-audit/SKILL.md` — the manual audit orchestration skill.
- `hooks/tests/agent-ledger/*.test.sh` — one test per code task.

Modified:
- `CLAUDE.md` — one bullet pointing to `agent-roster.md`.
- `settings.json` — wire the four hooks.

Data root created at runtime: `~/.claude/agent-ledger/{events,index,gaps,reports}/`, `roster-index.json`.

---

## Phase 1 — Doctrine and storage foundation

### Task 1: Anti-sprawl doctrine and conventions

**Files:**
- Create: `rules/common/agent-roster.md`

**Interfaces:**
- Produces: the governance doc referenced by CLAUDE.md (Task 8) and by the audit skill (Task 12). Defines the three-part test and the two model conventions the capture hooks depend on.

- [ ] **Step 1: Write the doctrine file**

Create `rules/common/agent-roster.md`:

```markdown
# Agent Roster Governance

Governs how the specialized-agent roster is grown, observed, and pruned. The roster is a small "smart swiss-army-knife" set, never hundreds of narrow agents.

## Anti-sprawl gate (three-part test)

A recurring capability gap justifies a NEW specialized agent only when ALL three hold; otherwise EXTEND an existing agent (add a tool, widen scope, add a mode):

1. Distinct reason-to-change — genuinely separate scope from every existing agent.
2. Clearer orchestrator routing — the main thread reasons better with it as a named role than with one more parameter on an existing agent.
3. Recurrence — the gap has cleared the Rule-of-Three gate (3+ occurrences across distinct sessions).

Over-narrow proposals (e.g. a "WebGL 3.0 implementer") fail test 1 or 2 and are rejected or folded. Default posture: consolidate before proliferate.

## Observation conventions (model behavior)

These make the roster observable. Both degrade gracefully if omitted.

1. Fallback rationale: when dispatching the `general-purpose` or `claude` built-in agent, prefix the subagent `description` with `FALLBACK-RATIONALE: <why no specialist fit>`.
2. Capability self-report: any agent blocked by a missing tool or permission emits, before returning, a line `CAPABILITY-BLOCKED: needed=<tool-or-capability> task=<short description>`.

## Lifecycle

Gap detection, resolution, and roster edits are recorded in the Agent Evolution Ledger (`~/.claude/agent-ledger/`). Resolutions are new events, never edits to prior events. See the spec at `docs/superpowers/specs/2026-07-02-agent-evolution-ledger-design.md`.
```

- [ ] **Step 2: Verify required sections exist**

Run: `grep -c -E 'three-part test|FALLBACK-RATIONALE|CAPABILITY-BLOCKED|Rule-of-Three' /Users/satanshumishra/.claude/rules/common/agent-roster.md`
Expected: `4`

- [ ] **Step 3: Checkpoint** — sections present; stop for review.

---

### Task 2: Shared ledger libraries

**Files:**
- Create: `hooks/agent-ledger/_ledger.py`
- Create: `hooks/agent-ledger/_ledger.mjs`
- Test: `hooks/tests/agent-ledger/ledger-lib.test.sh`

**Interfaces:**
- Produces (Python): `root()`, `now()`, `events_file()`, `append_event(obj)`, `cap(s, n=500)`, `redact(s)`.
- Produces (Node ESM): `root()`, `now()`, `eventsFile()`, `appendEvent(obj)`.
- `append_event`/`appendEvent` default `ts` and `schema_version`, create `events/` on demand, and append one JSON line to `events/YYYY-MM-DD.jsonl`.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/ledger-lib.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"

python3 -c "import sys; sys.path.insert(0,'$DIR'); import _ledger as L; L.append_event({'type':'t','v':1})"
DAY="$(date -u +%F)"
FILE="$AGENT_LEDGER_DIR/events/$DAY.jsonl"
assert_file_exists "$FILE" "python append created daily events file"
assert_contains "$(cat "$FILE")" '"schema_version":1' "python event has schema_version"

node --input-type=module -e "import {appendEvent} from '$DIR/_ledger.mjs'; appendEvent({type:'t2'})"
assert_contains "$(cat "$FILE")" '"type":"t2"' "node append wrote to same daily file"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/ledger-lib.test.sh`
Expected: FAIL (missing `_ledger.py` / `_ledger.mjs`)

- [ ] **Step 3: Write `_ledger.py`**

Create `hooks/agent-ledger/_ledger.py`:

```python
import os
import json
import re
import datetime


def root():
    return os.environ.get("AGENT_LEDGER_DIR") or os.path.join(
        os.path.expanduser("~"), ".claude", "agent-ledger"
    )


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def events_file():
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    return os.path.join(root(), "events", day + ".jsonl")


def append_event(obj):
    obj.setdefault("ts", now())
    obj.setdefault("schema_version", 1)
    path = events_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    line = json.dumps(obj, separators=(",", ":"))
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def cap(s, n=500):
    return (s or "")[:n]


def redact(s):
    s = s or ""
    return re.sub(
        r"(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{8,})",
        "[REDACTED]",
        s,
    )
```

- [ ] **Step 4: Write `_ledger.mjs`**

Create `hooks/agent-ledger/_ledger.mjs`:

```javascript
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export function root() {
  return process.env.AGENT_LEDGER_DIR || path.join(os.homedir(), ".claude", "agent-ledger");
}

export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function eventsFile() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(root(), "events", day + ".jsonl");
}

export function appendEvent(obj) {
  if (obj.ts === undefined) obj.ts = now();
  if (obj.schema_version === undefined) obj.schema_version = 1;
  const p = eventsFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + "\n");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/ledger-lib.test.sh`
Expected: `PASS`

- [ ] **Step 6: Checkpoint** — both libs green; stop for review.

---

### Task 3: Roster index generator

**Files:**
- Create: `hooks/agent-ledger/roster-index-gen.py`
- Test: `hooks/tests/agent-ledger/roster-index.test.sh`

**Interfaces:**
- Produces `roster-index.json` at `root()`: an array of `{name, description, tools[], scope_keywords[]}` for each agent in `~/.claude/agents/*.md` and `<cwd>/.claude/agents/*.md`. Consumed by the fallback nudge (Task 5) and the audit (Task 12).

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/roster-index.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
FAKE_HOME="$(mktemp -d)"; mkdir -p "$FAKE_HOME/.claude/agents"
cat > "$FAKE_HOME/.claude/agents/debugger.md" <<'EOF'
---
name: debugger
description: Debugging specialist for bugs, test failures, and unexpected behavior.
tools: Read, Edit, Bash
---
body
EOF
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
HOME="$FAKE_HOME" python3 "$DIR/roster-index-gen.py"
OUT="$AGENT_LEDGER_DIR/roster-index.json"
assert_file_exists "$OUT" "roster-index.json created"
assert_contains "$(cat "$OUT")" '"name": "debugger"' "roster contains debugger"
assert_contains "$(cat "$OUT")" 'debugging' "scope_keywords extracted from description"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/roster-index.test.sh`
Expected: FAIL (missing generator)

- [ ] **Step 3: Write the generator**

Create `hooks/agent-ledger/roster-index-gen.py`:

```python
#!/usr/bin/env python3
import sys
import os
import json
import re
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ledger as L

STOP = set(
    "this that with your from into their than then when what which agent agents "
    "task tasks code uses used using only never always must proactively".split()
)


def parse(fp):
    try:
        text = open(fp, encoding="utf-8").read()
    except Exception:
        return None
    m = re.search(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return None
    fm = m.group(1)

    def field(name):
        mm = re.search(r"^" + name + r":\s*(.+)$", fm, re.M)
        return mm.group(1).strip() if mm else ""

    name = field("name")
    if not name:
        return None
    desc = field("description")
    tools = [t.strip() for t in field("tools").split(",") if t.strip()]
    kws = sorted({w for w in re.findall(r"[a-z]{4,}", desc.lower()) if w not in STOP})
    return {"name": name, "description": desc[:300], "tools": tools, "scope_keywords": kws}


def main():
    dirs = [os.path.join(os.path.expanduser("~"), ".claude", "agents")]
    cwd = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    dirs.append(os.path.join(cwd, ".claude", "agents"))
    out, seen = [], set()
    for d in dirs:
        for fp in sorted(glob.glob(os.path.join(d, "*.md"))):
            a = parse(fp)
            if a and a["name"] not in seen:
                seen.add(a["name"])
                out.append(a)
    os.makedirs(L.root(), exist_ok=True)
    with open(os.path.join(L.root(), "roster-index.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/roster-index.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — generator green. Phase 1 complete; the ledger has storage + doctrine + roster snapshot but no capture yet. Stop for review.

---

## Phase 2 — Capture layer

### Task 4: Feasibility probe (gating verification)

**Files:**
- Create: `hooks/agent-ledger/probe.sh` (temporary; removed at end of task)

**Interfaces:**
- Produces verified answers to spec section 10 items 1, 2, 5 before Tasks 5 and 7 are trusted. No code depends on this task's output; it de-risks the assumptions.

- [ ] **Step 1: Write the probe hook**

Create `hooks/agent-ledger/probe.sh`:

```bash
#!/usr/bin/env bash
set -u
mkdir -p /tmp/agent-ledger-probe
ts="$(date -u +%s%N)"
cat > "/tmp/agent-ledger-probe/$1-$ts.json"
exit 0
```

- [ ] **Step 2: Temporarily wire probes in `settings.json`**

Add to `settings.json` `hooks` (remove after this task): a `PreToolUse` matcher `Agent` running `bash .../probe.sh pretooluse-agent`, a `SubagentStop` matcher `` running `bash .../probe.sh subagentstop`, and a `PermissionDenied` matcher `` running `bash .../probe.sh permissiondenied`.

- [ ] **Step 3: Trigger real events**

In a scratch Claude Code session: dispatch a `general-purpose` agent (fires PreToolUse Agent + SubagentStop), and attempt a globally-denied command like `curl https://example.com` (fires PermissionDenied).

- [ ] **Step 4: Inspect captured inputs**

Run: `for f in /tmp/agent-ledger-probe/*.json; do echo "== $f =="; jq 'keys, {tool_input_keys: (.tool_input|keys?), agent_type, transcript_path}' "$f"; done`

Confirm and record:
- `pretooluse-agent` input `.tool_input.subagent_type` exists. If ABSENT, switch Task 5 to a `SubagentStart` matcher `general-purpose` (logging only, drop the nudge) and note it.
- `subagentstop` input `.transcript_path` exists and points at the subagent transcript. If ABSENT, Task 7's `agent_run` writes `tokens:null` and metrics from whatever field carries the path.
- `permissiondenied` input carries `.tool_name` and a reason field.

- [ ] **Step 5: Remove the probe wiring and file**

Delete the three probe hook entries from `settings.json` and `rm hooks/agent-ledger/probe.sh /tmp/agent-ledger-probe/*.json`.

- [ ] **Step 6: Checkpoint** — record findings in the task notes; stop for review. Tasks 5/7 proceed on the confirmed field names.

---

### Task 5: Fallback capture and soft nudge

**Files:**
- Create: `hooks/agent-ledger/agent-fallback-capture.py`
- Test: `hooks/tests/agent-ledger/fallback-capture.test.sh`

**Interfaces:**
- Consumes: `_ledger.py`, `roster-index.json`, hook stdin JSON `{tool_name, tool_input:{subagent_type, description, prompt}, session_id, cwd, agent_type}`.
- Produces: appends a `fallback_used` event for `subagent_type ∈ {claude, general-purpose}`; prints exit-0 JSON `{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext}}` when candidates exist and the session was not already nudged for that candidate set. Exits 0 (never blocks) for all other tools.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/fallback-capture.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
cat > "$AGENT_LEDGER_DIR/roster-index.json" <<'EOF'
[{"name":"debugger","description":"d","tools":["Read"],"scope_keywords":["debugging","failures"]}]
EOF
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"

IN_GP='{"tool_name":"Agent","session_id":"s1","cwd":"/x/proj","tool_input":{"subagent_type":"general-purpose","description":"FALLBACK-RATIONALE: none fit","prompt":"investigate test failures and debugging"}}'
OUT="$(printf '%s' "$IN_GP" | python3 "$DIR/agent-fallback-capture.py")"
assert_contains "$(cat "$FILE")" '"type":"fallback_used"' "fallback_used logged"
assert_contains "$(cat "$FILE")" '"rationale":"none fit"' "rationale parsed"
assert_contains "$OUT" 'additionalContext' "nudge emitted"
assert_contains "$OUT" 'debugger' "nudge names the matching specialist"

IN_SPEC='{"tool_name":"Agent","session_id":"s2","cwd":"/x","tool_input":{"subagent_type":"implementer","description":"d","prompt":"p"}}'
OUT2="$(printf '%s' "$IN_SPEC" | python3 "$DIR/agent-fallback-capture.py")"
assert_empty "$OUT2" "specialist spawn produces no nudge"
assert_contains "$(grep -c fallback_used "$FILE")" "1" "specialist spawn logged no event"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/fallback-capture.test.sh`
Expected: FAIL (missing hook)

- [ ] **Step 3: Write the hook**

Create `hooks/agent-ledger/agent-fallback-capture.py`:

```python
#!/usr/bin/env python3
import sys
import os
import json
import re
import hashlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ledger as L


def candidates(text):
    try:
        roster = json.load(open(os.path.join(L.root(), "roster-index.json")))
    except Exception:
        return []
    toks = set(re.findall(r"[a-z]{4,}", text.lower()))
    scored = []
    for a in roster:
        overlap = len(set(a.get("scope_keywords") or []) & toks)
        if overlap > 0:
            scored.append((overlap, a.get("name") or ""))
    scored.sort(reverse=True)
    return [n for _, n in scored[:5] if n]


def already_nudged(session, cands):
    if not session:
        return False
    key = session + ":" + ",".join(sorted(cands))
    h = hashlib.sha1(key.encode()).hexdigest()[:16]
    d = os.path.join(L.root(), ".nudge-cache")
    os.makedirs(d, exist_ok=True)
    marker = os.path.join(d, h)
    if os.path.exists(marker):
        return True
    open(marker, "w").close()
    return False


def main():
    if os.environ.get("AGENT_LEDGER_SUPPRESS"):
        return
    try:
        d = json.loads(sys.stdin.read())
    except Exception:
        return
    if (d.get("tool_name") or "") != "Agent":
        return
    ti = d.get("tool_input") or {}
    sub = ti.get("subagent_type") or ""
    if sub not in ("claude", "general-purpose"):
        return
    desc = ti.get("description") or ""
    prompt = ti.get("prompt") or ""
    m = re.search(r"FALLBACK-RATIONALE:\s*(.+)", desc)
    rationale = m.group(1).strip() if m else None
    cands = candidates(desc + " " + prompt)
    L.append_event(
        {
            "type": "fallback_used",
            "session_id": d.get("session_id") or "",
            "cwd": d.get("cwd") or "",
            "project": os.path.basename(d.get("cwd") or ""),
            "emitter": d.get("agent_type") or "main",
            "subagent_type": sub,
            "description": L.redact(L.cap(desc)),
            "prompt_excerpt": L.redact(L.cap(prompt)),
            "rationale": rationale,
            "candidates_offered": cands,
        }
    )
    if cands and not already_nudged(d.get("session_id") or "", cands):
        msg = "Specialists that may fit: " + ", ".join(cands) + ". Use one if it applies; otherwise proceed."
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": msg}}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/fallback-capture.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — fallback capture + nudge green; stop for review.

---

### Task 6: Permission-denied capture

**Files:**
- Create: `hooks/agent-ledger/agent-permission-capture.py`
- Test: `hooks/tests/agent-ledger/permission-capture.test.sh`

**Interfaces:**
- Consumes: `_ledger.py`, PermissionDenied hook stdin `{tool_name, tool_input, session_id, cwd, agent_type, permission_decision_reason}`.
- Produces: appends a `permission_denied` event with `tool_name`, `agent_type`, `deny_rule`, redacted `denied_input_excerpt`.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/permission-capture.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
IN='{"tool_name":"Bash","agent_type":"data-engineer","session_id":"s1","cwd":"/x","permission_decision_reason":"deny rule Bash(curl:*)","tool_input":{"command":"curl https://x"}}'
printf '%s' "$IN" | python3 "$DIR/agent-permission-capture.py"
assert_contains "$(cat "$FILE")" '"type":"permission_denied"' "permission_denied logged"
assert_contains "$(cat "$FILE")" '"tool_name":"Bash"' "tool_name captured"
assert_contains "$(cat "$FILE")" '"agent_type":"data-engineer"' "agent_type captured"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/permission-capture.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the hook**

Create `hooks/agent-ledger/agent-permission-capture.py`:

```python
#!/usr/bin/env python3
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ledger as L


def main():
    if os.environ.get("AGENT_LEDGER_SUPPRESS"):
        return
    try:
        d = json.loads(sys.stdin.read())
    except Exception:
        return
    ti = d.get("tool_input") or {}
    L.append_event(
        {
            "type": "permission_denied",
            "session_id": d.get("session_id") or "",
            "cwd": d.get("cwd") or "",
            "project": os.path.basename(d.get("cwd") or ""),
            "emitter": d.get("agent_type") or "main",
            "agent_type": d.get("agent_type") or "main",
            "tool_name": d.get("tool_name") or "",
            "deny_rule": d.get("permission_decision_reason") or d.get("reason") or None,
            "denied_input_excerpt": L.redact(L.cap(json.dumps(ti, separators=(",", ":")))),
        }
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/permission-capture.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — permission capture green; stop for review.

---

### Task 7: Subagent-run analyzer

**Files:**
- Create: `hooks/agent-ledger/agent-run-analyzer.mjs`
- Test: `hooks/tests/agent-ledger/run-analyzer.test.sh`

**Interfaces:**
- Consumes: `_ledger.mjs`, SubagentStop hook stdin `{transcript_path, agent_type, session_id, cwd}`, and the transcript JSONL at `transcript_path`.
- Produces: appends one `agent_run` event with `tool_calls_total`, `duplicate_tool_calls`, `retry_loops`, `redundant_reads`, `tokens` (or null), `transcript_ptr`; and, if a `CAPABILITY-BLOCKED:` line appears in transcript text, one `capability_blocked` event with `needed`, `task_excerpt`.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/run-analyzer.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
TR="$AGENT_LEDGER_DIR/tr.jsonl"
cat > "$TR" <<'EOF'
{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a.txt"}}],"usage":{"input_tokens":10,"output_tokens":5}}}
{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/a.txt"}}]}}
{"message":{"content":[{"type":"text","text":"CAPABILITY-BLOCKED: needed=Write task=create migration file"}]}}
EOF
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
printf '%s' "{\"transcript_path\":\"$TR\",\"agent_type\":\"data-engineer\",\"session_id\":\"s1\",\"cwd\":\"/x\"}" | node "$DIR/agent-run-analyzer.mjs"
assert_contains "$(cat "$FILE")" '"type":"agent_run"' "agent_run logged"
assert_contains "$(cat "$FILE")" '"duplicate_tool_calls":1' "exact-duplicate Read counted"
assert_contains "$(cat "$FILE")" '"redundant_reads":1' "redundant read counted"
assert_contains "$(cat "$FILE")" '"tokens":15' "tokens summed from usage"
assert_contains "$(cat "$FILE")" '"type":"capability_blocked"' "capability_blocked logged"
assert_contains "$(cat "$FILE")" '"needed":"Write"' "needed capability parsed"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/run-analyzer.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the analyzer**

Create `hooks/agent-ledger/agent-run-analyzer.mjs`:

```javascript
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendEvent } from "./_ledger.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function main() {
  if (process.env.AGENT_LEDGER_SUPPRESS) return;
  let d;
  try {
    d = JSON.parse(readStdin());
  } catch {
    return;
  }
  const tpath = d.transcript_path || "";
  const base = {
    session_id: d.session_id || "",
    cwd: d.cwd || "",
    project: path.basename(d.cwd || ""),
    emitter: "main",
    agent_type: d.agent_type || "unknown",
  };
  let lines = [];
  try {
    lines = fs.readFileSync(tpath, "utf-8").split("\n");
  } catch {
    lines = [];
  }
  let toolCalls = 0,
    dup = 0,
    retry = 0,
    redundantReads = 0,
    tokens = 0,
    sawTokens = false,
    capBlocked = null,
    prevHash = null;
  const seen = new Map();
  const reads = new Map();
  for (const ln of lines) {
    if (!ln.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(ln);
    } catch {
      continue;
    }
    const content = (msg.message && msg.message.content) || msg.content || [];
    const usage = (msg.message && msg.message.usage) || msg.usage;
    if (usage) {
      sawTokens = true;
      tokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b && b.type === "text" && typeof b.text === "string") {
        const m = b.text.match(/CAPABILITY-BLOCKED:\s*needed=(\S+)\s+task=(.*)/);
        if (m) capBlocked = { needed: m[1], task: m[2].slice(0, 300) };
      }
      if (b && b.type === "tool_use") {
        toolCalls++;
        const h = b.name + ":" + JSON.stringify(b.input || {});
        seen.set(h, (seen.get(h) || 0) + 1);
        if (seen.get(h) > 1) dup++;
        if (prevHash === h) retry++;
        prevHash = h;
        if (b.name === "Read") {
          const fp = (b.input && b.input.file_path) || "";
          if (fp) {
            reads.set(fp, (reads.get(fp) || 0) + 1);
            if (reads.get(fp) > 1) redundantReads++;
          }
        }
      }
    }
  }
  appendEvent({
    ...base,
    type: "agent_run",
    tool_calls_total: toolCalls,
    duplicate_tool_calls: dup,
    retry_loops: retry,
    redundant_reads: redundantReads,
    tokens: sawTokens ? tokens : null,
    duration_ms: null,
    transcript_ptr: tpath,
    outcome: null,
  });
  if (capBlocked) {
    appendEvent({ ...base, type: "capability_blocked", needed: capBlocked.needed, task_excerpt: capBlocked.task });
  }
}

main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/run-analyzer.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — analyzer green; stop for review.

---

### Task 8: Wire hooks and conventions into config

**Files:**
- Modify: `settings.json` (hooks section)
- Modify: `CLAUDE.md` (one bullet)

**Interfaces:**
- Consumes: the five scripts from Tasks 3, 5, 6, 7.
- Produces: live capture on real sessions.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/settings-wired.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
S="$HOME/.claude/settings.json"
assert_contains "$(jq -e '.hooks.PreToolUse[] | select(.matcher=="Agent")' "$S" 2>/dev/null && echo ok)" "ok" "PreToolUse Agent matcher present"
assert_contains "$(jq -r '.hooks.PermissionDenied[0].hooks[0].command' "$S")" "agent-permission-capture.py" "PermissionDenied wired"
assert_contains "$(jq -r '.hooks.SubagentStop[0].hooks[0].command' "$S")" "agent-run-analyzer.mjs" "SubagentStop wired"
assert_contains "$(jq -r '.hooks.SessionStart[].hooks[].command' "$S")" "roster-index-gen.py" "roster generator wired at SessionStart"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/settings-wired.test.sh`
Expected: FAIL

- [ ] **Step 3: Add the four hook entries to `settings.json`**

Into `hooks.PreToolUse` add:

```json
{
  "matcher": "Agent",
  "hooks": [
    { "type": "command", "command": "python3 /Users/satanshumishra/.claude/hooks/agent-ledger/agent-fallback-capture.py", "timeout": 10 }
  ]
}
```

Add a new top-level `hooks.PermissionDenied`:

```json
"PermissionDenied": [
  {
    "matcher": "",
    "hooks": [
      { "type": "command", "command": "python3 /Users/satanshumishra/.claude/hooks/agent-ledger/agent-permission-capture.py", "timeout": 10 }
    ]
  }
]
```

Add a new top-level `hooks.SubagentStop`:

```json
"SubagentStop": [
  {
    "matcher": "",
    "hooks": [
      { "type": "command", "command": "node /Users/satanshumishra/.claude/hooks/agent-ledger/agent-run-analyzer.mjs", "async": true }
    ]
  }
]
```

Into the existing `hooks.SessionStart[0].hooks` array append:

```json
{ "type": "command", "command": "python3 /Users/satanshumishra/.claude/hooks/agent-ledger/roster-index-gen.py", "timeout": 10 }
```

- [ ] **Step 4: Validate JSON and add the CLAUDE.md bullet**

Run: `jq -e . /Users/satanshumishra/.claude/settings.json >/dev/null && echo VALID`
Expected: `VALID`

Into `CLAUDE.md`, under "Global invariants", add:

```markdown
- Agent roster is governed + observed per ~/.claude/rules/common/agent-roster.md (anti-sprawl doctrine + fallback-rationale and capability-blocked conventions; telemetry in ~/.claude/agent-ledger/).
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/settings-wired.test.sh`
Expected: `PASS`

- [ ] **Step 6: Checkpoint** — Phase 2 complete; capture is live and independently useful even before the audit exists. Stop for review.

---

## Phase 3 — Audit read-side

### Task 9: Index rebuild (gaps + baselines + checkpoint)

**Files:**
- Create: `hooks/agent-ledger/agent-ledger-index.mjs`
- Test: `hooks/tests/agent-ledger/index-rebuild.test.sh`

**Interfaces:**
- Consumes: `_ledger.mjs`, all `events/*.jsonl`.
- Produces (ESM exports): `clusterKey(event) -> string`, `rebuild(ledgerRoot) -> {gaps, baselines}`. Writes `index/gaps.json`, `index/agent-baselines.json`, `index/checkpoint.json`. `gap_id` is a stable hash of `cluster_key`. Status is `resolved` if a matching `gap_resolved` event exists, else `actionable` when `distinct_sessions >= 3`, else `open`.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/index-rebuild.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
mkdir -p "$AGENT_LEDGER_DIR/events"
E="$AGENT_LEDGER_DIR/events/2026-07-01.jsonl"
cat > "$E" <<'EOF'
{"type":"fallback_used","session_id":"a","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"b","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"c","description":"schema migration","prompt_excerpt":"schema"}
{"type":"fallback_used","session_id":"a","description":"css layout","prompt_excerpt":"frontend css"}
{"type":"agent_run","agent_type":"debugger","tool_calls_total":10,"duplicate_tool_calls":2,"redundant_reads":1,"tokens":100}
EOF
node "$DIR/agent-ledger-index.mjs"
G="$AGENT_LEDGER_DIR/index/gaps.json"
assert_file_exists "$G" "gaps.json written"
assert_contains "$(jq -r '[.[]|select(.cluster_key=="fallback:schema")][0].status' "$G")" "actionable" "3 distinct sessions -> actionable"
assert_contains "$(jq -r '[.[]|select(.cluster_key=="fallback:frontend")][0].status // [.[]|select(.cluster_key=="fallback:css")][0].status' "$G")" "open" "single-session cluster stays open"
assert_file_exists "$AGENT_LEDGER_DIR/index/agent-baselines.json" "baselines written"
assert_contains "$(jq -r '.debugger.runs' "$AGENT_LEDGER_DIR/index/agent-baselines.json")" "1" "debugger baseline recorded"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/index-rebuild.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the index rebuilder**

Create `hooks/agent-ledger/agent-ledger-index.mjs`:

```javascript
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root } from "./_ledger.mjs";

const DOMAIN = [
  "schema", "migration", "database", "test", "security", "auth", "performance",
  "latency", "documentation", "review", "research", "debug", "deploy", "pipeline",
  "infra", "frontend", "styling", "accessibility",
];

function firstDomain(text) {
  const t = (text || "").toLowerCase();
  for (const k of DOMAIN) if (t.includes(k)) return k;
  return "general";
}

export function clusterKey(e) {
  if (e.type === "fallback_used") return "fallback:" + firstDomain((e.description || "") + " " + (e.prompt_excerpt || ""));
  if (e.type === "permission_denied") return "perm:" + (e.tool_name || "unknown");
  if (e.type === "capability_blocked") return "cap:" + (e.needed || "unknown");
  return "";
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p90(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))];
}

export function rebuild(ledgerRoot) {
  const evDir = path.join(ledgerRoot, "events");
  let files = [];
  try {
    files = fs.readdirSync(evDir).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {}
  const gaps = {};
  const runs = {};
  const resolved = new Set();
  for (const f of files) {
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(evDir, f), "utf-8").split("\n");
    } catch {}
    for (const ln of lines) {
      if (!ln.trim()) continue;
      let e;
      try {
        e = JSON.parse(ln);
      } catch {
        continue;
      }
      if (e.type === "gap_resolved") {
        resolved.add(e.gap_id);
        continue;
      }
      if (e.type === "agent_run") {
        const k = e.agent_type || "unknown";
        (runs[k] = runs[k] || []).push(e);
        continue;
      }
      const key = clusterKey(e);
      if (!key) continue;
      const g = (gaps[key] = gaps[key] || {
        cluster_key: key, count: 0, sessions: new Set(), first_seen: e.ts, last_seen: e.ts, evidence_refs: [],
      });
      g.count++;
      g.sessions.add(e.session_id || "");
      g.last_seen = e.ts || g.last_seen;
      if (g.evidence_refs.length < 10) g.evidence_refs.push({ ts: e.ts, type: e.type, session_id: e.session_id || "" });
    }
  }
  const gapsOut = {};
  for (const [key, g] of Object.entries(gaps)) {
    const sessions = [...g.sessions].filter(Boolean);
    const gap_id = "gap-" + hash(key);
    let status = sessions.length >= 3 ? "actionable" : "open";
    if (resolved.has(gap_id)) status = "resolved";
    gapsOut[gap_id] = {
      gap_id, cluster_key: key, status, count: g.count,
      distinct_sessions: sessions.length, first_seen: g.first_seen, last_seen: g.last_seen,
      evidence_refs: g.evidence_refs,
    };
  }
  const baselines = {};
  for (const [k, rs] of Object.entries(runs)) {
    const tc = rs.map((r) => r.tool_calls_total || 0);
    const dr = rs.map((r) => (r.tool_calls_total ? (r.duplicate_tool_calls || 0) / r.tool_calls_total : 0));
    const rr = rs.map((r) => r.redundant_reads || 0);
    const tk = rs.map((r) => r.tokens || 0).filter((x) => x > 0);
    baselines[k] = {
      runs: rs.length,
      median_tool_calls: median(tc), p90_tool_calls: p90(tc),
      median_duplicate_ratio: median(dr), p90_duplicate_ratio: p90(dr),
      median_redundant_reads: median(rr), median_tokens: median(tk),
    };
  }
  const idxDir = path.join(ledgerRoot, "index");
  fs.mkdirSync(idxDir, { recursive: true });
  fs.writeFileSync(path.join(idxDir, "gaps.json"), JSON.stringify(Object.values(gapsOut), null, 2));
  fs.writeFileSync(path.join(idxDir, "agent-baselines.json"), JSON.stringify(baselines, null, 2));
  fs.writeFileSync(
    path.join(idxDir, "checkpoint.json"),
    JSON.stringify({ last_file: files[files.length - 1] || null, rebuilt_at: new Date().toISOString() }, null, 2)
  );
  return { gaps: Object.values(gapsOut), baselines };
}

if (process.argv[1] && process.argv[1].endsWith("agent-ledger-index.mjs")) {
  rebuild(root());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/index-rebuild.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — index + Rule-of-Three gate + baselines green; stop for review.

---

### Task 10: Anti-sprawl gate function

**Files:**
- Create: `hooks/agent-ledger/agent-roster-gate.mjs`
- Test: `hooks/tests/agent-ledger/roster-gate.test.sh`

**Interfaces:**
- Produces (ESM export + CLI): `verdict({recurrenceCount, distinctReasonToChange, clearerRouting}) -> "reject" | "extend" | "create"`. `reject` when `recurrenceCount < 3`; `create` only when both booleans hold; else `extend`. CLI form: `node agent-roster-gate.mjs '<json>'` prints the verdict.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/roster-gate.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":2,"distinctReasonToChange":true,"clearerRouting":true}')" "reject" "below Rule-of-Three -> reject"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":5,"distinctReasonToChange":true,"clearerRouting":true}')" "create" "distinct + clearer -> create"
assert_contains "$(node "$DIR/agent-roster-gate.mjs" '{"recurrenceCount":5,"distinctReasonToChange":false,"clearerRouting":true}')" "extend" "not distinct -> extend"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/roster-gate.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the gate**

Create `hooks/agent-ledger/agent-roster-gate.mjs`:

```javascript
#!/usr/bin/env node
export function verdict({ recurrenceCount = 0, distinctReasonToChange = false, clearerRouting = false } = {}) {
  if (recurrenceCount < 3) return "reject";
  if (distinctReasonToChange && clearerRouting) return "create";
  return "extend";
}

if (process.argv[1] && process.argv[1].endsWith("agent-roster-gate.mjs")) {
  let a = {};
  try {
    a = JSON.parse(process.argv[2] || "{}");
  } catch {}
  process.stdout.write(verdict(a) + "\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/roster-gate.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — gate green. Phase 3 complete; the read-side can compute actionable gaps and verdicts. Stop for review.

---

## Phase 4 — Audit report and resolution

### Task 11: Resolution applier

**Files:**
- Create: `hooks/agent-ledger/agent-ledger-resolve.mjs`
- Test: `hooks/tests/agent-ledger/resolve.test.sh`

**Interfaces:**
- Consumes: `_ledger.mjs`, `index/gaps.json`.
- Produces (ESM export + CLI): `resolve({gap_id, resolution, agent_refs, change_summary, notes})`. Appends one `agent_created`/`agent_modified`/`agent_deleted` per `agent_refs` entry plus one `gap_resolved`; flips the gap's status to `resolved` in `gaps.json`; writes `gaps/<gap_id>.md` (ADR-style, status: resolved). `resolution ∈ {create, modify, delete, merge, split}`.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/resolve.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
mkdir -p "$AGENT_LEDGER_DIR/index"
echo '[{"gap_id":"gap-abc","cluster_key":"perm:Bash","status":"actionable"}]' > "$AGENT_LEDGER_DIR/index/gaps.json"
node "$DIR/agent-ledger-resolve.mjs" '{"gap_id":"gap-abc","resolution":"modify","agent_refs":["data-engineer"],"change_summary":"added Bash tool"}'
FILE="$AGENT_LEDGER_DIR/events/$(date -u +%F).jsonl"
assert_contains "$(cat "$FILE")" '"type":"agent_modified"' "agent_modified event appended"
assert_contains "$(cat "$FILE")" '"type":"gap_resolved"' "gap_resolved event appended"
assert_contains "$(jq -r '.[0].status' "$AGENT_LEDGER_DIR/index/gaps.json")" "resolved" "gap status flipped"
assert_file_exists "$AGENT_LEDGER_DIR/gaps/gap-abc.md" "gap markdown written"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/resolve.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the resolver**

Create `hooks/agent-ledger/agent-ledger-resolve.mjs`:

```javascript
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root, appendEvent } from "./_ledger.mjs";

const KIND = {
  create: "agent_created",
  modify: "agent_modified",
  delete: "agent_deleted",
  merge: "agent_modified",
  split: "agent_created",
};

export function resolve({ gap_id, resolution, agent_refs = [], change_summary = "", notes = "" }) {
  const r = root();
  const kind = KIND[resolution] || "agent_modified";
  for (const name of agent_refs) {
    appendEvent({ type: kind, agent_name: name, change_summary, gap_id });
  }
  appendEvent({ type: "gap_resolved", gap_id, resolution, agent_refs, notes });
  const idx = path.join(r, "index", "gaps.json");
  let gaps = [];
  try {
    gaps = JSON.parse(fs.readFileSync(idx, "utf-8"));
  } catch {}
  const hit = Array.isArray(gaps) ? gaps.find((g) => g.gap_id === gap_id) : null;
  if (hit) {
    hit.status = "resolved";
    fs.writeFileSync(idx, JSON.stringify(gaps, null, 2));
  }
  const gd = path.join(r, "gaps");
  fs.mkdirSync(gd, { recursive: true });
  const md =
    `---\ngap_id: ${gap_id}\nstatus: resolved\nresolution: ${resolution}\n` +
    `agents: ${agent_refs.join(", ")}\n---\n\n${change_summary}\n\n${notes}\n`;
  fs.writeFileSync(path.join(gd, gap_id + ".md"), md);
  return hit || null;
}

if (process.argv[1] && process.argv[1].endsWith("agent-ledger-resolve.mjs")) {
  let a = {};
  try {
    a = JSON.parse(process.argv[2] || "{}");
  } catch {}
  resolve(a);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/resolve.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — resolver green; stop for review.

---

### Task 12: The `/agent-gap-audit` skill

**Files:**
- Create: `skills/agent-gap-audit/SKILL.md`
- Test: `hooks/tests/agent-ledger/skill-structure.test.sh`

**Interfaces:**
- Consumes: `agent-ledger-index.mjs`, `agent-roster-gate.mjs`, `agent-ledger-resolve.mjs`, the `researcher` agent, the `report` skill, and `agent-roster.md`.
- Produces: a user-triggered orchestration that rebuilds the index, promotes actionable gaps, researches each, applies the anti-sprawl gate, renders a report, and applies approved resolutions.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/agent-ledger/skill-structure.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
F="$HOME/.claude/skills/agent-gap-audit/SKILL.md"
assert_file_exists "$F" "SKILL.md exists"
assert_contains "$(cat "$F")" "agent-ledger-index.mjs" "references index rebuild"
assert_contains "$(cat "$F")" "AGENT_LEDGER_SUPPRESS" "sets suppress flag for its own spawns"
assert_contains "$(cat "$F")" "agent-roster-gate.mjs" "references anti-sprawl gate"
assert_contains "$(cat "$F")" "report" "renders via report skill"
assert_contains "$(head -6 "$F")" "name: agent-gap-audit" "has skill frontmatter name"
finish
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash hooks/tests/agent-ledger/skill-structure.test.sh`
Expected: FAIL

- [ ] **Step 3: Write the skill**

Create `skills/agent-gap-audit/SKILL.md`:

```markdown
---
name: agent-gap-audit
description: Use when the user runs /agent-gap-audit or asks to audit the agent roster for capability gaps, missing specialists, permission failures, or inefficient agents. Replays the Agent Evolution Ledger, clusters gaps, applies the anti-sprawl gate, and produces a cited report with recommended roster changes. On-demand only.
---

# Agent Gap Audit

Manual audit of the Agent Evolution Ledger (`~/.claude/agent-ledger/`). Governed by `~/.claude/rules/common/agent-roster.md`. Never auto-runs.

Set `AGENT_LEDGER_SUPPRESS=1` in the environment for every subagent this skill dispatches, so audit-time research does not pollute the gap log.

## Steps

1. Rebuild the read-model:
   `AGENT_LEDGER_SUPPRESS=1 node ~/.claude/hooks/agent-ledger/agent-ledger-index.mjs`
   Then read `~/.claude/agent-ledger/index/gaps.json` and `index/agent-baselines.json`.

2. Select actionable gaps: entries with `status == "actionable"` (already past the Rule-of-Three gate). Also flag `agent_run` outliers: any agent whose recent runs exceed its own `p90_duplicate_ratio` or `p90_tool_calls` in the baselines. Surface outliers for human review only; never auto-conclude a step was wasteful.

3. Research each actionable gap: dispatch the `researcher` agent (recursively as needed) to characterize the missing capability and survey how the existing roster (`~/.claude/agents/`, via `roster-index.json`) does or does not cover it. Default hypothesis: extend an existing specialist.

4. Apply the anti-sprawl gate per gap. Compute the three inputs, then:
   `node ~/.claude/hooks/agent-ledger/agent-roster-gate.mjs '{"recurrenceCount":N,"distinctReasonToChange":BOOL,"clearerRouting":BOOL}'`
   A `create` verdict means propose a new agent; `extend` means modify an existing one; `reject` means leave it. Record a `recommendation_rejected` rationale for rejects.

5. Render the report via the `report` skill: pass the gap evidence, the researcher findings, the baselines, and the per-gap recommended diffs (exact agent-file changes). The report is cited and teaching-oriented.

6. On the user's per-recommendation approval, dispatch the appropriate specialist subagent to apply the agent-file change, then record it:
   `node ~/.claude/hooks/agent-ledger/agent-ledger-resolve.mjs '{"gap_id":"...","resolution":"modify|create|delete|merge|split","agent_refs":["..."],"change_summary":"...","notes":"..."}'`

7. Re-run step 1 so the resolved gaps drop out of the actionable set.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash hooks/tests/agent-ledger/skill-structure.test.sh`
Expected: `PASS`

- [ ] **Step 5: Checkpoint** — skill present and wired to the scripts; stop for review.

---

### Task 13: End-to-end smoke test

**Files:**
- Create: `hooks/tests/agent-ledger/e2e.test.sh`

**Interfaces:**
- Consumes: the full pipeline (capture scripts + index + resolve).
- Produces: proof that capture -> index -> resolve round-trips a gap from actionable to resolved.

- [ ] **Step 1: Write the end-to-end test**

Create `hooks/tests/agent-ledger/e2e.test.sh`:

```bash
#!/usr/bin/env bash
set -u
. "$(dirname "$0")/../_assert.sh"
export AGENT_LEDGER_DIR="$(mktemp -d)"
DIR="$(cd "$(dirname "$0")/../../agent-ledger" && pwd)"
echo '[]' > "$AGENT_LEDGER_DIR/roster-index.json"
for s in a b c; do
  printf '%s' "{\"tool_name\":\"Agent\",\"session_id\":\"$s\",\"cwd\":\"/x\",\"tool_input\":{\"subagent_type\":\"general-purpose\",\"description\":\"schema migration work\",\"prompt\":\"schema migration\"}}" | python3 "$DIR/agent-fallback-capture.py" >/dev/null
done
node "$DIR/agent-ledger-index.mjs"
G="$AGENT_LEDGER_DIR/index/gaps.json"
GID="$(jq -r '.[0].gap_id' "$G")"
assert_contains "$(jq -r '.[0].status' "$G")" "actionable" "3-session fallback cluster is actionable"
node "$DIR/agent-ledger-resolve.mjs" "{\"gap_id\":\"$GID\",\"resolution\":\"create\",\"agent_refs\":[\"schema-specialist\"],\"change_summary\":\"new agent\"}"
node "$DIR/agent-ledger-index.mjs"
assert_contains "$(jq -r '.[0].status' "$G")" "resolved" "gap resolved after resolve + rebuild"
finish
```

- [ ] **Step 2: Run the full suite**

Run: `for t in hooks/tests/agent-ledger/*.test.sh; do echo "== $t =="; bash "$t"; done`
Expected: every file prints `PASS`

- [ ] **Step 3: Checkpoint** — full pipeline green end to end. Phase 4 complete. Stop for review.

---

## Self-Review notes (author)

- Spec coverage: capture (spec 6) -> Tasks 5/6/7; storage (spec 5) -> Task 2 + event shapes across Tasks 5-11; roster index (6.5) -> Task 3; conventions (6.4) -> Task 1 + Task 8; audit read-side (7 steps 1-6) -> Tasks 9/10/12; anti-sprawl doctrine (8) -> Task 1 + Task 10; resolution (7 step 8) -> Task 11; feasibility caveats (10) -> Task 4 gates Tasks 5/7.
- Deferred by design: incremental index (spec 5.6) is implemented as full replay (correct, simple); `checkpoint.json` is written for a future incremental optimization. OTEL token export (spec 2 non-goal) is out; `tokens` is best-effort from the transcript. `cluster_key` normalization is a fixed domain list (Task 9) — deliberately simple and deterministic; widening it is a later refinement, not a placeholder.
- Type/name consistency: event `type` strings, `gap_id` derivation (hash of `cluster_key`), and the `resolve`/`rebuild`/`verdict`/`clusterKey` signatures are consistent across Tasks 9-13.
```
