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
