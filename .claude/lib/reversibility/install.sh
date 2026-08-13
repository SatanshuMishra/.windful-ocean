#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
out_dir="$HOME/Library/LaunchAgents"

while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir)
      out_dir="${2:-}"
      shift 2
      ;;
    --repo)
      repo_root="${2:-}"
      shift 2
      ;;
    -h|--help)
      printf 'usage: install.sh [--out-dir <dir>] [--repo <dir>]\n'
      printf 'Renders the reversibility launchd jobs. It never loads or starts them.\n'
      exit 0
      ;;
    *)
      printf 'unrecognized argument %s; usage: install.sh [--out-dir <dir>] [--repo <dir>]\n' "$1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$out_dir" ] || [ ! -d "$out_dir" ]; then
  printf 'refusing to install: --out-dir %s is not an existing directory\n' "${out_dir:-<empty>}" >&2
  exit 1
fi

if ! git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1; then
  printf 'refusing to install: --repo %s is not a git repository, so the reaper would have no checkpoint refs to expire\n' "${repo_root:-<empty>}" >&2
  exit 1
fi

mkdir -p "$HOME/.claude/logs"

written=()
while IFS= read -r line; do
  written+=("$line")
done < <(node "$script_dir/launchd.mjs" --out-dir "$out_dir" --repo "$repo_root")

printf 'Rendered %d launchd job(s):\n' "${#written[@]}"
for path in "${written[@]}"; do
  printf '  %s\n' "$path"
done

printf '\nNothing was loaded or started. To install them, run:\n\n'
for path in "${written[@]}"; do
  printf '  launchctl bootstrap gui/$(id -u) %s\n' "$path"
done

printf '\nTo remove them later, run:\n\n'
for path in "${written[@]}"; do
  printf '  launchctl bootout gui/$(id -u) %s\n' "$path"
done
