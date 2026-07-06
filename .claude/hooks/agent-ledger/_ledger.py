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
