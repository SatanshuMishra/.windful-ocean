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
