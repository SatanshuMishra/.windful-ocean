#!/usr/bin/env python3
# secret-scanner.sh — PreToolUse(Edit|Write), BLOCKING on high-confidence secret pattern match.
import json
import re
import sys

data = json.load(sys.stdin)
ti = data.get("tool_input", {})
content = ti.get("new_string", "") or ti.get("content", "") or ti.get("file_text", "") or ""

patterns = {
    "openai_key": r"sk-[a-zA-Z0-9]{32,}",
    "github_pat": r"ghp_[a-zA-Z0-9]{36}",
    "github_oauth": r"gho_[a-zA-Z0-9]{36}",
    "github_server": r"ghs_[a-zA-Z0-9]{36}",
    "slack_bot": r"xoxb-[a-zA-Z0-9-]{40,}",
    "aws_key": r"AKIA[0-9A-Z]{16}",
    "google_api": r"AIza[0-9A-Za-z_-]{35}",
    "jwt_like": r"eyJhbGciOi[A-Za-z0-9._-]{40,}",
    "private_key": r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
}

for name, pattern in patterns.items():
    if re.search(pattern, content):
        print(f"BLOCKED: Detected high-confidence secret pattern ({name}). Refusing to write. Use environment variables or a secret manager.", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
