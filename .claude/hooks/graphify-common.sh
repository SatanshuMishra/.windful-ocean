#!/usr/bin/env bash

GRAPHIFY_OUT_NAME="graphify-out"

graphify_root() {
  local c="${CLAUDE_PROJECT_DIR:-}"
  if [ -z "$c" ] || [ ! -d "$c" ]; then
    c="$(git -C "${c:-$PWD}" rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
  fi
  c="$(cd -- "$c" 2>/dev/null && pwd -P)" || return 1
  [ -n "$c" ] || return 1
  local home
  home="$(cd -- "$HOME" 2>/dev/null && pwd -P)" || home="$HOME"
  case "$c" in
    "$home"|"$(dirname -- "$home")"|/|/Users|/tmp|/private/tmp|/var|/private/var|/etc) return 1 ;;
  esac
  echo "$c"
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
  GRAPHIFY_OUT="$out" nohup bash -c 'graphify update "$1" >>"$2" 2>&1; rm -rf -- "$3"' _ "$root" "$log" "$lock" &
  echo "$!" >"$lock/pid" 2>/dev/null || true
}
