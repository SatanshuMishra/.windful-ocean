#!/usr/bin/env bash
set -u
ASSERT_FAILS=0
assert_contains() {
  case "$1" in
    *"$2"*) printf 'ok   - %s\n' "$3" ;;
    *) printf 'FAIL - %s (missing: %s)\n' "$3" "$2"; ASSERT_FAILS=$((ASSERT_FAILS+1)) ;;
  esac
}
assert_empty() {
  if [ -z "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (expected empty, got: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
assert_file_exists() {
  if [ -e "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (missing file: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
assert_file_absent() {
  if [ ! -e "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (file should be gone: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
finish() {
  if [ "$ASSERT_FAILS" -eq 0 ]; then printf 'PASS\n'; exit 0; else printf '%d assertion(s) failed\n' "$ASSERT_FAILS"; exit 1; fi
}
