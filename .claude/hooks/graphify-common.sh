#!/usr/bin/env bash

GRAPHIFY_OUT_NAME="graphify-out"
GRAPHIFY_KEEP_BACKUPS_DEFAULT=3
GRAPHIFY_COLLAPSE_PCT_DEFAULT=25

graphify_main_worktree() {
  local top="$1" main check
  [ -n "$top" ] || return 1
  main="$(git -C "$top" worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')" || main=""
  if [ -z "$main" ] || [ "$main" = "$top" ]; then
    echo "$top"
    return 0
  fi
  main="$(cd -- "$main" 2>/dev/null && pwd -P)" || { echo "$top"; return 0; }
  check="$(git -C "$main" rev-parse --show-toplevel 2>/dev/null)" || { echo "$top"; return 0; }
  check="$(cd -- "$check" 2>/dev/null && pwd -P)" || { echo "$top"; return 0; }
  if [ "$check" = "$main" ]; then
    echo "$main"
  else
    echo "$top"
  fi
}

graphify_root() {
  local c="${CLAUDE_PROJECT_DIR:-}"
  if [ -z "$c" ] || [ ! -d "$c" ]; then
    c="${c:-$PWD}"
  fi
  c="$(cd -- "$c" 2>/dev/null && pwd -P)" || return 1
  [ -n "$c" ] || return 1

  local top
  top="$(git -C "$c" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$top" ] || return 1
  top="$(cd -- "$top" 2>/dev/null && pwd -P)" || return 1
  [ -n "$top" ] || return 1

  top="$(graphify_main_worktree "$top")" || return 1

  local home
  home="$(cd -- "$HOME" 2>/dev/null && pwd -P)" || home="$HOME"

  case "$top" in
    "$home"|"$(dirname -- "$home")"|/|/Users|/tmp|/private/tmp|/var|/private/var|/etc)
      return 1 ;;
    */"$GRAPHIFY_OUT_NAME"|*/"$GRAPHIFY_OUT_NAME"/*)
      return 1 ;;
  esac

  local deny_default deny_list denied real old_ifs
  deny_default="$home/.agent:$home/.claude:$home/.claude_personal:$home/.codex"
  deny_default="$deny_default:/tmp:/private/tmp:/var/folders:/var/tmp:${TMPDIR:-}"
  deny_list="${GRAPHIFY_DENY_ROOTS-$deny_default}"
  old_ifs="${IFS:-}"
  IFS=':'
  for denied in $deny_list; do
    IFS="$old_ifs"
    if [ -n "$denied" ]; then
      real="$(cd -- "$denied" 2>/dev/null && pwd -P)" || real="$denied"
      case "$top" in
        "$denied"|"$denied"/*) return 1 ;;
      esac
      case "$top" in
        "$real"|"$real"/*) return 1 ;;
      esac
    fi
    IFS=':'
  done
  IFS="$old_ifs"

  if [ -e "$top/.graphify-disable" ]; then
    return 1
  fi

  echo "$top"
}

graphify_config_dir() {
  local c="${CLAUDE_CONFIG_DIR:-}"
  if [ -z "$c" ]; then
    [ -n "${HOME:-}" ] || return 1
    c="$HOME/.claude"
  fi
  c="$(cd -- "$c" 2>/dev/null && pwd -P)" || return 1
  [ -n "$c" ] || return 1
  echo "$c"
}

graphify_out() {
  local root="$1"
  [ -n "$root" ] || return 1
  local override="${GRAPHIFY_OUT:-}"
  if [ -n "$override" ]; then
    case "$override" in
      /*) echo "$override" ;;
      *) echo "$root/$override" ;;
    esac
    return 0
  fi
  local config
  if config="$(graphify_config_dir)"; then
    case "$root" in
      "$config"|"$config"/*) echo "$config/$GRAPHIFY_OUT_NAME"; return 0 ;;
    esac
  fi
  echo "$root/$GRAPHIFY_OUT_NAME"
}

graphify_int() {
  local v="$1"
  case "$v" in
    ''|*[!0-9]*) echo 0 ;;
    *) echo "$v" ;;
  esac
}

graphify_node_count() {
  local graph="$1"
  if [ ! -f "$graph" ]; then
    echo 0
    return 0
  fi
  local n
  n="$(python3 -c 'import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        print(len(json.load(f).get("nodes") or []))
except Exception:
    print(0)' "$graph" 2>/dev/null)" || n=0
  graphify_int "$n"
}

graphify_built_commit() {
  local graph="$1"
  if [ ! -f "$graph" ]; then
    return 0
  fi
  python3 -c 'import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        c = json.load(f).get("built_at_commit") or ""
    print(c[:8])
except Exception:
    print("")' "$graph" 2>/dev/null || true
}

graphify_write_health() {
  local out="$1" before="$2" after="$3" rc="${4:-0}"
  [ -d "$out" ] || return 0
  before="$(graphify_int "$before")"
  after="$(graphify_int "$after")"
  rc="$(graphify_int "$rc")"

  local peak
  peak="$(python3 -c '
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        print(int(json.load(f).get("nodes_peak") or 0))
except Exception:
    print(0)' "$out/.graphify_health.json" 2>/dev/null)" || peak=0
  peak="$(graphify_int "$peak")"
  [ "$before" -gt "$peak" ] && peak="$before"
  [ "$after" -gt "$peak" ] && peak="$after"

  local limit drop graph_status
  limit="$(graphify_int "${GRAPHIFY_COLLAPSE_PCT:-$GRAPHIFY_COLLAPSE_PCT_DEFAULT}")"
  [ "$limit" -gt 0 ] || limit="$GRAPHIFY_COLLAPSE_PCT_DEFAULT"
  drop=0
  graph_status=ok
  if [ "$peak" -gt 0 ] && [ "$after" -lt "$peak" ]; then
    drop=$(( (peak - after) * 100 / peak ))
    if [ "$drop" -ge "$limit" ]; then
      graph_status=collapsed
    fi
  fi
  if [ "$after" -eq 0 ]; then
    graph_status=empty
  fi
  if [ "$rc" -ne 0 ]; then
    graph_status=failed
  fi

  local commit tmp
  commit="$(graphify_built_commit "$out/graph.json")"
  tmp="$out/.graphify_health.json.$$"
  {
    printf '{"checked_at":%s,"nodes_before":%s,"nodes_after":%s,"nodes_peak":%s,' \
      "$(date +%s)" "$before" "$after" "$peak"
    printf '"drop_pct":%s,"update_exit":%s,"status":"%s","built_at_commit":"%s"}\n' \
      "$drop" "$rc" "$graph_status" "$commit"
  } >"$tmp" 2>/dev/null || { rm -f -- "$tmp" 2>/dev/null; return 0; }
  mv -f -- "$tmp" "$out/.graphify_health.json" 2>/dev/null || rm -f -- "$tmp" 2>/dev/null
  return 0
}

graphify_prune() {
  local out="$1" keep
  case "$out" in
    /*) ;;
    *) return 0 ;;
  esac
  [ -d "$out" ] && [ ! -L "$out" ] || return 0
  [ -f "$out/graph.json" ] || [ -f "$out/.graphify_health.json" ] || return 0
  keep="$(graphify_int "${GRAPHIFY_KEEP_BACKUPS:-$GRAPHIFY_KEEP_BACKUPS_DEFAULT}")"
  [ "$keep" -gt 0 ] || keep="$GRAPHIFY_KEEP_BACKUPS_DEFAULT"
  ls -1d "$out"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] 2>/dev/null \
    | sort -r \
    | tail -n +$(( keep + 1 )) \
    | while IFS= read -r d; do
        case "$d" in
          "$out"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
            if [ -d "$d" ] && [ ! -L "$d" ]; then rm -rf -- "$d"; fi ;;
        esac
      done
  return 0
}

graphify_launch() {
  local root="$1" log="$2" out="$3"
  [ -n "$root" ] && [ -n "$log" ] && [ -n "$out" ] || return 1
  local lock="$out/.hook.lock"
  if [ -d "$lock" ]; then
    local held
    held="$(cat -- "$lock/pid" 2>/dev/null || true)"
    if [ -n "$held" ] && kill -0 "$held" 2>/dev/null; then return 0; fi
    local age
    age="$(( $(date +%s) - $(stat -f %m "$lock" 2>/dev/null || stat -c %Y "$lock" 2>/dev/null || echo 0) ))"
    [ "$age" -lt 15 ] && return 0
    rm -rf -- "$lock" 2>/dev/null || true
  fi
  mkdir -p -- "$out" 2>/dev/null || true
  mkdir -- "$lock" 2>/dev/null || return 0
  local lib
  lib="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)/graphify-common.sh"
  GRAPHIFY_OUT="$out" nohup bash -c '
    out="$4"
    before=0
    if [ -f "$5" ]; then . "$5"; before="$(graphify_node_count "$out/graph.json")"; fi
    graphify update "$1" >>"$2" 2>&1
    rc=$?
    if [ -f "$5" ]; then
      after="$(graphify_node_count "$out/graph.json")"
      graphify_write_health "$out" "$before" "$after" "$rc"
      graphify_prune "$out"
    fi
    rm -rf -- "$3"
  ' _ "$root" "$log" "$lock" "$out" "$lib" >/dev/null 2>&1 </dev/null &
  echo "$!" >"$lock/pid" 2>/dev/null || true
}
