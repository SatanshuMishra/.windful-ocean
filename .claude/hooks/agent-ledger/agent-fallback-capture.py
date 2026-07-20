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
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
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
