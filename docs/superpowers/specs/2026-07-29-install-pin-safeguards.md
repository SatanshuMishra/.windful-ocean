# Install pin safeguards (0101 steps 1-4)

Status: designed, not implemented. Authored 2026-07-29.
Governing decisions: 0100 (pin the global install to a main-tracking worktree), 0101 (land the safeguards before applying the pin).
Ordering is ratified and non-negotiable: step 1, then 2, then 3, then 4.

## Verified ground truth (confirmed live 2026-07-29)

- `~/.claude` is a real directory whose entries are symlinks into the primary checkout at `/Users/satanshumishra/Documents/DevLabs/.windful-ocean`. 38 links: 10 at depth 1, 26 under `hooks/`, 2 under `rules/`.
- `~/.claude-install` and `~/.claude/state` do not exist.
- `.claude/lib/superpowers-parallel/.drift-state.json` is tracked and currently modified.
- Local `main` is stale at `cd5c65d`; `origin/main` is ahead. Every step names `origin/main` explicitly and never consults local `main`.
- The one non-farm symlink under `~/.claude` is `debug/latest`, which targets inside `~/.claude` itself.

## Step 1 - relocate drift state, close the fail-open

Hard prerequisite. Until this lands, the pinned worktree self-dirties every session and the cleanliness signal that step 2 depends on cries wolf.

### Fail-open ruling

Line 7 (`[ -f "$RESOLVER" ] || exit 0`) fails loud. No legitimate-absence case exists: the hook only runs because `settings.json` registers it, and `settings.json` and `lib/` are symlinks into the same tree at the same depth. Any world where the hook runs is one where the tree that registered it also shipped the resolver. Absence is therefore always a broken install, never a determinable no-op.

Line 10 (`[ -n "$CUR" ] || exit 0`) is the same bug class, and is really two instances: `2>/dev/null || true` on line 9 converts every failure (missing node, resolver crash, thrown exception) into an empty value, and line 10 converts empty into silence.

Exit 1, not 2. SessionStart cannot block; both codes render stderr identically, and 2's documented semantic is "blocking error", which this is not.

### Replacement hook

```bash
#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="$HOME/.claude/state"
STATE="$STATE_DIR/superpowers-drift-state.json"
RESOLVER="$HOME/.claude/lib/superpowers-parallel/resolve-superpowers.mjs"

fail() {
  printf 'superpowers-drift-check: %s\n' "$1" >&2
  exit 1
}

[ -f "$RESOLVER" ] || fail "resolver missing at $RESOLVER; drift cannot be checked - the superpowers-parallel install is broken or was removed without deregistering this hook"

mkdir -p "$STATE_DIR" || fail "cannot create $STATE_DIR; drift state has nowhere to live"

if ! CUR="$(node "$RESOLVER" --state 2>/dev/null)"; then
  ERR="$(node "$RESOLVER" --state 2>&1 >/dev/null || true)"
  fail "resolver failed; drift cannot be checked: ${ERR:-nonzero exit, no stderr}"
fi
[ -n "$CUR" ] || fail "resolver printed nothing; drift cannot be checked"

if [ ! -f "$STATE" ]; then
  printf '%s\n' "$CUR" > "$STATE"
  exit 0
fi

PREV="$(cat "$STATE" 2>/dev/null || true)"
if [ "$CUR" != "$PREV" ]; then
  CUR_VER="$(printf '%s' "$CUR" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || true)"
  printf 'Superpowers changed (now %s) - re-validate the mitosis contract (prompt/version drift detected; see ~/.claude/skills/mitosis/SKILL.md).\n' "$CUR_VER" >&2
  printf '%s\n' "$CUR" > "$STATE"
fi

exit 0
```

The failure path reruns the resolver once to capture stderr, keeping the success path's output pure so no stderr pollutes the JSON being compared.

### Supporting changes

`.gitignore`, under the runtime-state section: `/.claude/lib/superpowers-parallel/.drift-state.json`. This suppresses recreation by any older revision of the hook still running from a retired branch. On branches where the file remains tracked, gitignore does not suppress modified status; that is transitional and acceptable.

No gitignore entry is needed for the new location: `~/.claude/state` is a real directory outside the repo. The existing unanchored `.claude-*` pattern never touches `~/.claude-install`, which lives in `$HOME`, outside the repo entirely.

### Sequencing

1. `mkdir -p ~/.claude/state`
2. `cp -p` the live drift-state to `~/.claude/state/superpowers-drift-state.json`. Copy, not move: the live hook stays on the old code path until the pin cuts over, so a move only causes recreation and working-tree churn. Preserving the value costs one command and avoids a spurious drift warning in the first session after the change, which would train distrust of the exact channel this work protects.
3. Fresh branch off `origin/main` in a scratch worktree: hook rewrite, gitignore line, and removal of the tracked file as one atomic commit.
4. PR through the centralized `pr-create` tool; merge to `origin/main`.
5. Must be on `origin/main` before step 4 runs. The migration script asserts this mechanically.

The file removal is confirmation-class in this environment and requires explicit human confirmation before running.

Residual: between merge and cutover the old hook may write newer state to the old path. Re-run the step-2 copy immediately before migrating. Skipping it costs at most one spurious drift line.

## Step 2 - SessionStart freshness check

Ratified behavior: auto-refresh when behind `origin/main` and clean, reporting the revision movement; refuse and warn loudly naming dirty files when behind and dirty; report unverifiable when the fetch fails; never exit 0 quietly when the answer cannot be determined. Additionally assert HEAD is still detached, that no `~/.claude` symlink still points at the primary checkout, and that every symlink resolves.

### Harness semantics

SessionStart stdout is added as context the agent can see. SessionStart cannot block; a nonzero exit shows stderr to the user as a hook-error notice and the session proceeds. Therefore stderr is the human channel, stdout the agent channel, and a nonzero exit is safe on every path. Every loud path writes the same payload to both streams.

Unresolved: whether stdout still reaches context on a nonzero exit. The design is safe under both readings, since the human always receives stderr.

### Phase order

Single script, one settings entry, `timeout: 60`, internal self-deadline about 25s.

0. Bootstrap gate. Install root absent with the applied-marker present is catastrophic (row H); absent without the marker is pre-pin idle (row A).
1. Window audit, before anything else. Probe for any writable entry under the install root. Any writable entry with no live lock means a crashed refresh: take the lock, reseal, run the cleanliness check, report loudly (row I). This runs unconditionally and is the actual crash-safety guarantee.
2. Read-only assertions, no lock needed: repo sanity, HEAD detached, and the 38-link scan checking each link for dangling and for a realpath not under the install root. Roughly 40 lstat/realpath calls; milliseconds.
3. Bounded fetch. `GIT_TERMINAL_PROMPT=0`, SSH `BatchMode=yes ConnectTimeout=5`, run as a background child polled to an 8s deadline then TERM/KILL, since macOS ships no `timeout(1)` by default. On success touch `~/.claude/state/install-last-fetch`. The fetch writes shared refs and objects in the checkout's `.git`, outside the sealed root, so it needs no write window.
4. Classify. Equal to `origin/main` is fresh; else ancestor test gives behind, otherwise diverged. `git status --porcelain` works on a read-only tree because the index lives in the writable worktree admin dir.
5. Refresh, the only path that opens the window. Requires lock held, fetch succeeded, clean, behind, and detached. Set the trap first, then `chmod -R u+w`, `git checkout --detach <new-sha>`, `chmod -R a-w`, release lock.

Deliberate choice the record permits: no refresh when the fetch failed, even if local refs show behind. 0101 mandates only reporting on fetch failure, and mutating on a degraded signal doubles the state space the next session must reason about.

### Outcome matrix

Every row prints at least one line. All lines share a greppable `INSTALL-FRESHNESS:` prefix.

| Row | Outcome | Exit | Content |
|---|---|---|---|
| A | Pre-pin: no install root, no marker | 0 | one calm stdout line, pin not applied yet |
| B | Fresh, all assertions pass | 0 | one line: at sha, equal to origin/main, verified at time |
| C | Behind and clean, refreshed | 0 | revision movement old to new, commit count, relay directive |
| D | Behind and dirty | 2 | loud refusal naming first 10 dirty files plus total |
| E | Diverged, or HEAD attached to a branch | 2 | loud, names stray commits or branch, refuses to move HEAD |
| F | Fetch failed or timed out | 2 | freshness not verified, current sha, age of last successful fetch |
| G | Lock held by a live young process | 2 | could not verify this session, holder pid and age |
| H | Marker present but install root missing or not a worktree | 2 | catastrophic, manual recovery required |
| I | Window found open at start | 2 | install was left writable by a crashed refresh, resealed, cleanliness result |
| J | Checkout failed mid-refresh | 2 | git error tail, trap has resealed |

Row C is exit 0 deliberately. A successful refresh is nominal, and rendering it as a hook error would train the user to ignore those notices, which is the exact cry-wolf failure 0101 records for the drift checker. Exit 2 is reserved for cannot-determine or cannot-act.

### Locking

`mkdir ~/.claude/state/install-refresh.lock`, atomic on POSIX. It must live outside the sealed root, which cannot hold it while read-only, and outside any tracked tree, or it recreates the exact bug step 1 removes. The hook creates `~/.claude/state` and asserts it is a real directory, not a symlink into a repo.

Lock holds an info file with pid, session id, ISO-8601 start time, hostname. A holder is live iff `kill -0` succeeds and lock age is at most 600s; the age cap bounds pid-reuse false-liveness, and worst case delays a refresh by ten minutes loudly rather than silently.

Stale claim is race-free by rename: rename the lock dir to a stale name suffixed with epoch and pid. rename(2) is atomic so exactly one contender wins; losers retry once then report row G. The winner creates a fresh lock and appends a recovery note to its report. Stale dirs are kept for post-mortem and pruned after 7 days.

Release order: reseal before removing the lock, inside one trap installed before the window opens, so no other session can observe lock-free-and-writable.

What the lock does not survive is SIGKILL, possibly including the harness's own timeout kill. Both residues, stale lock and open window, are repaired by the next session's phase 1 and the stale-claim logic. The 60s configured timeout against a 25s internal deadline means the internal trap fires long before any harness kill on every nominal path.

## Step 3 - install-root deny and read-only

Three additions:

1. `settings.json` `permissions.deny`: `Edit(~/.claude-install/**)`, `Write(~/.claude-install/**)`, `NotebookEdit(~/.claude-install/**)`. Read stays allowed.
2. `protect-claude-config.sh`: an install-root class emitting `deny` instead of `ask`, reusing the existing literal-plus-realpath candidate set. Because post-pin every `~/.claude/<entry>` realpaths into the install root, this automatically converts edits addressed through the symlinks from ask to deny. The everyday edit flow becomes checkout, PR, merge, auto-refresh. This shift must be surfaced to the user, not discovered by them.
3. `block-destructive-bash.sh`: deny any command whose normalized text mentions `.claude-install`. Blanket-by-mention is the faithful reading of hard deny; the false-positive cost is acceptable because the freshness hook performs the read-only diagnostics itself.

### What each layer actually buys

| Layer | Buys | Does not buy |
|---|---|---|
| `permissions.deny` path rules | hard wall for Edit, Write, NotebookEdit on the literal path | symlink-alias coverage, unverified, which is why the hook layer exists |
| Hook deny via realpath | alias-proof wall for file tools from any origin path | anything outside the Edit and Write matchers |
| Bash mention-deny | friction against accidental and casually-injected shell writes | soundness; string gates are evadable by construction and must never be claimed otherwise |
| `chmod -R a-w` | the only OS-level layer; turns every accidental write from any process into a loud EACCES instead of silent corruption | nothing against a deliberate same-uid actor, who can chmod it back, as the hook itself proves daily |

The honest composite claim: the deny layers stop the agent's tool surface, the chmod stops everyone else's accidents, and nothing here stops a determined same-uid process. True immutability requires root and is deliberately out of scope.

## Step 4 - the migration script

### mv -fh, verified against this machine's man page

`-f` only suppresses the overwrite prompt. `-h` is the guard: "If the target operand is a symbolic link to a directory, do not follow it. This causes the mv utility to rename the file source to the destination path target rather than moving source into the directory referenced by target." Without `-h`, moving onto `~/.claude/lib` deposits the source inside the real `lib/` in the checkout. The script hard-pins `/bin/mv` so a GNU coreutils `mv` earlier on PATH, which has no `-h`, can never be substituted.

### Repointing rule

Repoint exactly those symlinks, at any depth under `~/.claude`, whose readlink target lies under `<checkout>/.claude/`. No depth heuristic, no name list. Verified to produce exactly the 38 links 0100 recorded, and to exclude every real entry, `debug/latest`, real files nested in farm dirs, and `~/.zshrc`.

The invariant asserted in preflight is to-migrate plus already-migrated equals 38, which stays compatible with idempotent re-runs while still catching any link the ratified decision never inventoried. A 39th link, or one targeting the checkout outside `.claude/`, aborts with the list printed.

### Script

Proposed location `.claude/scripts/pin-install-migrate.sh`, chosen to avoid the `.claude-*` and `*session*` ignore patterns.

```bash
#!/usr/bin/env bash
set -euo pipefail

CHECKOUT="/Users/satanshumishra/Documents/DevLabs/.windful-ocean"
FARM="$HOME/.claude"
INSTALL="$HOME/.claude-install"
EXPECTED_LINKS=38
STATE_DIR="$FARM/state"
MANIFEST="$STATE_DIR/install-migration-manifest.tsv"
MODE="${1:-plan}"
PIN=""

say() { printf '%s\n' "$*"; }
die() { printf 'ABORT: %s\n' "$*" >&2; exit 1; }

farm_links() {
  find "$FARM" -type l -print0 | while IFS= read -r -d '' link; do
    printf '%s\t%s\n' "$link" "$(readlink "$link")"
  done
}

links_targeting() {
  farm_links | awk -F '\t' -v p="$1/" 'index($2, p) == 1'
}

count_lines() {
  awk 'END { print NR }'
}

new_target_for() {
  printf '%s/.claude/%s' "$INSTALL" "${1#"$CHECKOUT/.claude/"}"
}

old_target_for() {
  printf '%s/.claude/%s' "$CHECKOUT" "${1#"$INSTALL/.claude/"}"
}

swap_link() {
  local link="$1" target="$2" tmp
  tmp="$(mktemp -u "$(dirname "$link")/.repoint.XXXXXX")"
  ln -s "$target" "$tmp"
  /bin/mv -fh "$tmp" "$link"
  [ "$(readlink "$link")" = "$target" ] || die "swap failed for $link"
  [ -e "$link" ] || die "$link does not resolve after swap"
}

snapshot_real_entries() {
  find "$FARM" -mindepth 1 -maxdepth 1 ! -type l -exec /usr/bin/stat -f '%i %N' {} + | sort
}

preflight() {
  [ -d "$FARM" ] || die "$FARM is not a directory"
  if [ -L "$FARM" ]; then die "$FARM is itself a symlink; this design requires a real directory"; fi
  git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null || die "$CHECKOUT is not a git worktree"
  git -C "$CHECKOUT" fetch origin main || die "cannot fetch origin/main; refusing to pin or verify against a stale ref"
  PIN="$(git -C "$CHECKOUT" rev-parse origin/main)" || die "origin/main did not resolve"
  local n_todo n_done
  n_todo="$(links_targeting "$CHECKOUT" | count_lines)"
  n_done="$(links_targeting "$INSTALL" | count_lines)"
  if [ $((n_todo + n_done)) -ne "$EXPECTED_LINKS" ]; then
    links_targeting "$CHECKOUT"
    links_targeting "$INSTALL"
    die "farm inventory is $n_todo unmigrated + $n_done migrated links, expected $EXPECTED_LINKS; the install surface changed since decision 0100 - re-verify before proceeding"
  fi
  while IFS=$'\t' read -r link target; do
    case "$target" in
      "$CHECKOUT/.claude/"*) ;;
      *) die "unclassified link $link -> $target targets the checkout outside .claude" ;;
    esac
  done < <(links_targeting "$CHECKOUT")
}

ensure_worktree() {
  if [ ! -e "$INSTALL" ]; then
    git -C "$CHECKOUT" worktree add --detach "$INSTALL" origin/main
    return
  fi
  local common
  common="$(git -C "$INSTALL" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || die "$INSTALL exists but is not a git worktree"
  [ "$common" = "$CHECKOUT/.git" ] || die "$INSTALL belongs to $common, not this repository"
  if git -C "$INSTALL" symbolic-ref -q HEAD >/dev/null; then
    die "$INSTALL HEAD is attached to a branch; the pin must stay detached"
  fi
  [ -z "$(git -C "$INSTALL" status --porcelain)" ] || die "$INSTALL working tree is dirty; refusing to touch a modified install"
  [ "$(git -C "$INSTALL" rev-parse HEAD)" = "$PIN" ] || die "$INSTALL is detached at $(git -C "$INSTALL" rev-parse HEAD), not origin/main $PIN; refresh belongs to the freshness check, not this script"
}

gate_targets() {
  grep -q '\.claude/state' "$INSTALL/.claude/hooks/superpowers-drift-check.sh" || die "the pinned revision still writes drift state into the tracked tree; merge the relocation to origin/main first (decision 0101 step 1)"
  local missing=0
  while IFS=$'\t' read -r link target; do
    if [ ! -e "$(new_target_for "$target")" ]; then
      say "missing at pin: $(new_target_for "$target") (needed by $link)"
      missing=1
    fi
  done < <(links_targeting "$CHECKOUT")
  [ "$missing" -eq 0 ] || die "the pinned revision lacks the targets listed above; repointing would sever them"
}

plan_report() {
  say "pin revision: $PIN"
  if [ -e "$INSTALL" ]; then
    say "worktree: already present at $INSTALL"
  else
    say "worktree: would be created at $INSTALL detached at origin/main"
  fi
  say "links to repoint:"
  while IFS=$'\t' read -r link target; do
    say "  $link -> $(new_target_for "$target")"
  done < <(links_targeting "$CHECKOUT")
  say "links already pinned: $(links_targeting "$INSTALL" | count_lines)"
  say "dry run only; nothing was changed - re-run with --apply to migrate"
}

apply() {
  ensure_worktree
  gate_targets
  mkdir -p "$STATE_DIR" || die "cannot create $STATE_DIR"
  local before after todo
  before="$(snapshot_real_entries)"
  todo="$(links_targeting "$CHECKOUT")"
  printf 'run\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$PIN" >> "$MANIFEST"
  if [ -n "$todo" ]; then
    while IFS=$'\t' read -r link target; do
      swap_link "$link" "$(new_target_for "$target")"
      printf 'link\t%s\t%s\t%s\n' "$link" "$target" "$(new_target_for "$target")" >> "$MANIFEST"
      say "repointed $link"
    done <<< "$todo"
  fi
  after="$(snapshot_real_entries)"
  [ "$before" = "$after" ] || die "non-symlink entries under $FARM changed during migration; inspect immediately"
  verify
}

rollback() {
  local done_links
  done_links="$(links_targeting "$INSTALL")"
  [ -n "$done_links" ] || die "no links target $INSTALL; nothing to roll back"
  while IFS=$'\t' read -r link target; do
    local old
    old="$(old_target_for "$target")"
    [ -e "$old" ] || die "checkout path missing for rollback: $old"
    swap_link "$link" "$old"
    say "rolled back $link"
  done <<< "$done_links"
  say "rollback complete; $INSTALL was left in place - remove it only via git worktree remove with explicit human confirmation"
}

verify() {
  local stale pinned broken=0
  stale="$(links_targeting "$CHECKOUT" | count_lines)"
  [ "$stale" -eq 0 ] || die "$stale links still target the primary checkout"
  pinned="$(links_targeting "$INSTALL" | count_lines)"
  [ "$pinned" -eq "$EXPECTED_LINKS" ] || die "expected $EXPECTED_LINKS pinned links, found $pinned"
  while IFS=$'\t' read -r link target; do
    if [ ! -e "$link" ]; then
      say "broken link: $link"
      broken=1
    fi
  done < <(links_targeting "$INSTALL")
  [ "$broken" -eq 0 ] || die "broken links listed above"
  if git -C "$INSTALL" symbolic-ref -q HEAD >/dev/null; then die "$INSTALL HEAD is not detached"; fi
  [ -z "$(git -C "$INSTALL" status --porcelain)" ] || die "$INSTALL working tree is dirty"
  [ "$(git -C "$INSTALL" rev-parse HEAD)" = "$(git -C "$CHECKOUT" rev-parse origin/main)" ] || die "$INSTALL is not at origin/main"
  say "verified: $EXPECTED_LINKS links pinned to $INSTALL, worktree clean and detached at origin/main"
}

main() {
  case "$MODE" in
    plan) preflight; plan_report ;;
    --apply) preflight; apply ;;
    --rollback) rollback ;;
    --verify) verify ;;
    *) die "usage: $0 [plan|--apply|--rollback|--verify]" ;;
  esac
}

main
```

### Atomicity and rollback

Each swap creates a temp link in the same directory then renames it into place, so no link is ever absent or dangling even for an instant. Global atomicity across 38 renames is unattainable, but intermediate states are coherent because 0100 verified the two trees byte-identical except one line in `mitosis-git.mjs`. A crash leaves a mixed but working farm; re-running completes it; `--rollback` reverses it.

Human authorization is encoded rather than assumed: the default invocation is a dry-run plan and mutation requires an explicit `--apply` run by the human.

### New artifact requirement

The pin-apply must additionally write `~/.claude/state/install-pin-applied` recording the sha and date. That marker is what flips an absent install root from row A (calm) to row H (catastrophic) in the freshness check, and it gates the assertion that symlinks must resolve under the install. Without it those two states are indistinguishable.

## Known residuals and open questions

- `~/.zshrc` still symlinks into the primary checkout, so shell config keeps tracking whatever branch is out. Outside `~/.claude` and outside 0100's ratified 38-link scope, so the migration deliberately does not touch it; post-pin it becomes the last live-config symlink tracking an unpinned branch. Needs a decision of its own. Whether other `$HOME` dotfiles share this coupling is unverified.
- An open write window with no subsequent session leaves the install writable until the next session starts. A periodic launchd audit would close this; not recommended now on simplicity grounds. Recorded as a known residual.
- Unverified: whether `permissions.deny` path patterns resolve symlinks; the signal the harness uses at hook timeout; whether SessionStart stdout reaches context on a nonzero exit; git checkout's unlink-versus-truncate behavior. Each is designed around rather than relied upon.
- The 38-link constant is a point-in-time snapshot. Any config change adding a farm symlink makes preflight abort. That is intended behavior, and is recorded here so nobody "fixes" it by deleting the check.
- `gate_targets` greps for `.claude/state` as textual proof step 1 merged. A later refactor referencing the path indirectly would false-abort, which is the safe direction.

## Self-replacement hazard

The freshness hook resolves into the very tree its refresh rewrites, and bash reads scripts incrementally. Structural mitigation, sufficient on its own: the entire script is function definitions with a final line `main "$@"; exit "$?"`. Bash parses that complete list before executing, so once `main` starts, execution never depends on re-reading the file, and the trailing exit on the same parsed line prevents reading post-EOF garbage if the file is replaced with a longer one. The script must never exec back into itself and never source tree files after the checkout within the same run.
