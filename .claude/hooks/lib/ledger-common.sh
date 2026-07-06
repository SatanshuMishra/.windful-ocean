#!/usr/bin/env bash
set -u

ledger_locate() {
  _cwd="$1"
  _transcript="$2"
  if [ -n "$_cwd" ] && [ -f "$_cwd/.claude/ledger/PROJECT.md" ]; then
    printf '%s' "$_cwd/.claude/ledger"
    return 0
  fi
  if [ -n "$_transcript" ]; then
    _proj="$(dirname "$_transcript")"
    if [ -f "$_proj/ledger/PROJECT.md" ]; then
      printf '%s' "$_proj/ledger"
      return 0
    fi
    if [ -f "$_proj/PROJECT.md" ]; then
      printf '%s' "$_proj"
      return 0
    fi
  fi
  return 1
}

ledger_field() {
  awk -v k="$2" '
    /^---[[:space:]]*$/ { fm = (fm ? 0 : 1); next }
    fm && index($0, k ":") == 1 {
      sub("^" k ":[[:space:]]*", "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      print
      exit
    }
  ' "$1"
}

ledger_section_line() {
  awk -v h="$2" '
    $0 == h { found = 1; next }
    found && NF {
      gsub(/^[[:space:]]*[-*][[:space:]]*/, "")
      print
      exit
    }
  ' "$1"
}
