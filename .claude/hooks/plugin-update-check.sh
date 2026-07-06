#!/usr/bin/env bash

INTERVAL_DAYS=7
CACHE_DIR="$HOME/.claude/cache"
STATE_FILE="$CACHE_DIR/plugin-update-check.json"
LOCK_FILE="$CACHE_DIR/plugin-update-check.lock"
LOG_FILE="$CACHE_DIR/plugin-update-check.log"
SETTINGS_FILE="$HOME/.claude/settings.json"
MARKETPLACES_FILE="$HOME/.claude/plugins/known_marketplaces.json"

file_mtime() {
  local m
  m=$(stat -f %m "$1" 2>/dev/null || echo 0)
  case "$m" in
    ''|*[!0-9]*) m=0 ;;
  esac
  printf '%s' "$m"
}

mode_sync() {
  mkdir -p -m 700 "$CACHE_DIR" 2>/dev/null || true

  STATE_FILE="$STATE_FILE" SETTINGS_FILE="$SETTINGS_FILE" python3 -c '
import json, os, re, sys
try:
    with open(os.environ["STATE_FILE"]) as f:
        state = json.load(f)
except Exception:
    sys.exit(0)
updates = state.get("updates", []) if isinstance(state, dict) else []
if not isinstance(updates, list) or not updates:
    sys.exit(0)

def sanitize(value):
    return re.sub(r"[^A-Za-z0-9._/-]", "", str(value))[:64]

def live_statusline_version(pkg):
    try:
        with open(os.environ["SETTINGS_FILE"]) as f:
            settings = json.load(f)
        command = ((settings.get("statusLine") or {}).get("command") or "")
    except Exception:
        return None
    match = re.search(re.escape(pkg) + r"@([0-9]+\.[0-9]+\.[0-9]+)", command)
    return match.group(1) if match else None

items = []
for u in updates:
    if not isinstance(u, dict):
        continue
    kind = u.get("kind")
    if kind == "statusline":
        raw_pkg = u.get("pkg", "ccstatusline")
        raw_latest = u.get("latest", "?")
        live = live_statusline_version(raw_pkg)
        if live is not None and live == raw_latest:
            continue
        pkg = sanitize(raw_pkg)
        current = sanitize(u.get("current", "?"))
        latest = sanitize(raw_latest)
        action = f"review changelog, then edit settings.json .statusLine to @{latest}"
        items.append(f"{pkg} {current} -> {latest} [{action}]")
    elif kind == "marketplace":
        name = sanitize(u.get("name", "?"))
        action = f"claude plugin marketplace update {name} (review diff first)"
        items.append(f"marketplace {name} is behind upstream [{action}]")
if not items:
    sys.exit(0)
n = len(items)
context = (
    f"{n} Claude Code third-party update(s) available "
    f"(manual review — nothing auto-applies): "
    + "; ".join(items)
    + ". See ~/.claude/cache/plugin-update-check.json."
)
out = {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}
print(json.dumps(out))
' 2>/dev/null || true

  local last_check
  last_check=$(STATE_FILE="$STATE_FILE" python3 -c '
import json, os
try:
    with open(os.environ["STATE_FILE"]) as f:
        print(int(json.load(f).get("last_check", 0)))
except Exception:
    print(0)
' 2>/dev/null || echo 0)
  case "$last_check" in
    ''|*[!0-9]*) last_check=0 ;;
  esac

  local now interval lock_fresh lock_mtime
  now=$(date +%s 2>/dev/null || echo 0)
  case "$now" in
    ''|*[!0-9]*) now=0 ;;
  esac
  interval=$(( INTERVAL_DAYS * 86400 ))

  lock_fresh=0
  if [ -f "$LOCK_FILE" ]; then
    lock_mtime=$(file_mtime "$LOCK_FILE")
    if [ $(( now - lock_mtime )) -lt 3600 ]; then
      lock_fresh=1
    fi
  fi

  if [ $(( now - last_check )) -ge "$interval" ] && [ "$lock_fresh" -eq 0 ]; then
    nohup bash "$0" --refresh </dev/null >>"$LOG_FILE" 2>&1 & disown 2>/dev/null || true
  fi

  exit 0
}

mode_refresh() {
  mkdir -p -m 700 "$CACHE_DIR" 2>/dev/null || true

  local now lock_mtime
  now=$(date +%s 2>/dev/null || echo 0)
  case "$now" in
    ''|*[!0-9]*) now=0 ;;
  esac

  if [ -f "$LOCK_FILE" ]; then
    lock_mtime=$(file_mtime "$LOCK_FILE")
    if [ $(( now - lock_mtime )) -lt 3600 ]; then
      exit 0
    fi
  fi
  echo "$$" > "$LOCK_FILE" 2>/dev/null || true
  trap 'rm -f "$LOCK_FILE" 2>/dev/null' EXIT

  find "$CACHE_DIR" -maxdepth 1 -name '.plugin-update-check.*.tmp' -type f -mmin +60 -exec rm -f {} + 2>/dev/null || true
  : > "$LOG_FILE" 2>/dev/null || true

  local records=()
  local settings_parsed statusline_pinned marketplace_enum_ok marketplace_keys
  settings_parsed=0
  statusline_pinned=0
  marketplace_enum_ok=0
  marketplace_keys=""

  local cmd token pkg current latest npm_rc
  if jq -e . "$SETTINGS_FILE" >/dev/null 2>&1; then
    settings_parsed=1
    cmd=$(jq -r '.statusLine.command // ""' "$SETTINGS_FILE" 2>/dev/null || echo "")
    token=$(printf '%s\n' "$cmd" | tr ' \t' '\n\n' | grep -E 'ccstatusline@' | head -1)
    if [ -n "$token" ]; then
      pkg="${token%@*}"
      current="${token##*@}"
      if [ -n "$pkg" ] && [ -n "$current" ] && printf '%s' "$current" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
        statusline_pinned=1
        if printf '%s' "$pkg" | grep -Eq '^(@[a-z0-9._-]+/)?[a-z0-9._-]+$'; then
          latest=$(npm view "$pkg" version --fetch-timeout=8000 --fetch-retries=1 --no-audit --no-fund 2>>"$LOG_FILE")
          npm_rc=$?
          latest=$(printf '%s' "$latest" | tr -d '[:space:]')
          if [ "$npm_rc" -eq 0 ] && printf '%s' "$latest" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'; then
            if [ "$latest" != "$current" ]; then
              records+=("update"$'\t'"statusline"$'\t'"statusline:$pkg"$'\t'"$pkg"$'\t'"$current"$'\t'"$latest")
            else
              records+=("clean"$'\t'$'\t'"statusline:$pkg")
            fi
          else
            records+=("failed"$'\t'$'\t'"statusline:$pkg")
          fi
        else
          records+=("failed"$'\t'$'\t'"statusline:$pkg")
        fi
      fi
    fi
  fi

  if jq -e 'type == "object"' "$MARKETPLACES_FILE" >/dev/null 2>&1; then
    marketplace_enum_ok=1
    marketplace_keys=$(jq -r 'keys[]' "$MARKETPLACES_FILE" 2>/dev/null)
  fi

  local name loc source_id branch local_hash remote_hash
  if [ "$marketplace_enum_ok" -eq 1 ]; then
    while IFS=$'\t' read -r name loc; do
      [ -z "$name" ] && continue
      [ -z "$loc" ] && continue
      source_id="marketplace:$name"
      if ! git -C "$loc" rev-parse --git-dir >/dev/null 2>&1; then
        continue
      fi
      branch=$(git -C "$loc" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
      if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
        branch="main"
      fi
      local_hash=$(git -C "$loc" rev-parse HEAD 2>/dev/null || echo "")
      remote_hash=$(git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=8 -C "$loc" ls-remote origin "refs/heads/$branch" 2>>"$LOG_FILE" | awk '{print $1}' | head -1)
      if [ -n "$remote_hash" ] && [ -n "$local_hash" ]; then
        if [ "$remote_hash" != "$local_hash" ]; then
          records+=("update"$'\t'"marketplace"$'\t'"$source_id"$'\t'"$name"$'\t'"${local_hash:0:7}"$'\t'"${remote_hash:0:7}")
        else
          records+=("clean"$'\t'$'\t'"$source_id")
        fi
      else
        records+=("failed"$'\t'$'\t'"$source_id")
      fi
    done < <(jq -r 'to_entries[] | "\(.key)\t\(.value.installLocation // "")"' "$MARKETPLACES_FILE" 2>/dev/null)
  fi

  local tmp prc
  tmp=$(printf '%s\n' "${records[@]}" | \
    SETTINGS_PARSED="$settings_parsed" \
    STATUSLINE_PINNED="$statusline_pinned" \
    MARKETPLACE_ENUM_OK="$marketplace_enum_ok" \
    MARKETPLACE_KEYS="$marketplace_keys" \
    STATE_FILE="$STATE_FILE" CACHE_DIR="$CACHE_DIR" python3 -c '
import json, os, sys, tempfile, time
try:
    try:
        with open(os.environ["STATE_FILE"]) as f:
            prior = json.load(f)
    except Exception:
        prior = {}
    prior_updates = prior.get("updates", []) if isinstance(prior, dict) else []
    prior_by_source = {}
    for u in prior_updates:
        if isinstance(u, dict) and u.get("source"):
            prior_by_source[u["source"]] = u

    settings_parsed = os.environ.get("SETTINGS_PARSED") == "1"
    statusline_pinned = os.environ.get("STATUSLINE_PINNED") == "1"
    enum_ok = os.environ.get("MARKETPLACE_ENUM_OK") == "1"
    market_keys = set(k for k in os.environ.get("MARKETPLACE_KEYS", "").split("\n") if k)
    market_sources = set("marketplace:" + k for k in market_keys)

    run_results = {}
    success_count = 0
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t")
        status = parts[0]
        if status == "update" and len(parts) >= 6:
            _, kind, source, name, cur, lat = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            success_count += 1
            if kind == "statusline":
                action = f"review changelog, then edit settings.json .statusLine to @{lat}"
                run_results[source] = ("update", {"source": source, "kind": "statusline", "pkg": name, "current": cur, "latest": lat, "action": action})
            else:
                action = f"claude plugin marketplace update {name} (review diff first)"
                run_results[source] = ("update", {"source": source, "kind": "marketplace", "name": name, "current": cur, "latest": lat, "action": action})
        elif status == "clean" and len(parts) >= 3:
            run_results[parts[2]] = ("clean", None)
            success_count += 1
        elif status == "failed" and len(parts) >= 3:
            run_results[parts[2]] = ("failed", None)

    prior_statusline = [u for s, u in prior_by_source.items() if s.startswith("statusline:")]
    prior_marketplace = [s for s in prior_by_source if s.startswith("marketplace:")]

    statusline_expected = settings_parsed and statusline_pinned
    marketplace_expected = enum_ok and len(market_keys) > 0
    attempted = (
        statusline_expected
        or marketplace_expected
        or len(run_results) > 0
        or (not enum_ok and len(prior_marketplace) > 0)
        or (not settings_parsed and len(prior_statusline) > 0)
    )

    if success_count == 0 and attempted:
        sys.exit(2)

    new_updates = []

    run_statusline = None
    for source, outcome in run_results.items():
        if source.startswith("statusline:"):
            run_statusline = outcome
            break
    prior_sl = prior_statusline[0] if prior_statusline else None
    if not settings_parsed:
        if prior_sl is not None:
            new_updates.append(prior_sl)
    elif not statusline_pinned:
        pass
    else:
        if run_statusline is not None:
            rstatus, payload = run_statusline
            if rstatus == "update":
                new_updates.append(payload)
            elif rstatus == "failed" and prior_sl is not None:
                new_updates.append(prior_sl)
        elif prior_sl is not None:
            new_updates.append(prior_sl)

    if enum_ok:
        for source in sorted(market_sources):
            outcome = run_results.get(source)
            if outcome is None:
                if source in prior_by_source:
                    new_updates.append(prior_by_source[source])
                continue
            rstatus, payload = outcome
            if rstatus == "update":
                new_updates.append(payload)
            elif rstatus == "failed" and source in prior_by_source:
                new_updates.append(prior_by_source[source])
    else:
        for source in sorted(prior_marketplace):
            new_updates.append(prior_by_source[source])

    state_out = {"last_check": int(time.time()), "updates": new_updates}
    fd, tmp = tempfile.mkstemp(dir=os.environ["CACHE_DIR"], prefix=".plugin-update-check.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(state_out, f, indent=2)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    print(tmp)
except SystemExit:
    raise
except Exception:
    sys.exit(1)
')
  prc=$?

  if [ "$prc" -eq 0 ] && [ -n "$tmp" ] && [ -f "$tmp" ]; then
    mv -f "$tmp" "$STATE_FILE" 2>>"$LOG_FILE" || rm -f "$tmp" 2>/dev/null
  fi

  exit 0
}

case "${1:-}" in
  --refresh) mode_refresh ;;
  *) mode_sync ;;
esac
