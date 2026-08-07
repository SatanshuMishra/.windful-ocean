# PreToolUse Bash Guard: Deny-by-Default Decision Rule

**Status:** proposed - awaits user approval on the Over-Block Bill and Open User Calls
**Date:** 2026-07-26
**Repo:** `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin`
**Branch:** `fix/pre-tool-use-guard` @ `5f04dd4` (TIP) vs `main` @ `0fe1c02` (LIVE)
**Governing thread:** `pre-tool-use-guard-deny-by-default-inversion` (01KYG4AEKA6NM746BXVRAZ9DWE). Owns criteria 1, 2, 3. Criteria 4 and 5 are downstream.

---

## Context

The PreToolUse Bash guard protects the session-continuity ledger store from direct filesystem mutation, forcing all writes through the ledger MCP tools (auto-approved at `hooks/lib/pre-tool-use.mjs:111-113`).

Two implementations exist, neither dominant:

| | LIVE `0fe1c02` | TIP `5f04dd4` |
|---|---|---|
| Mechanism | Blunt substring: `MUTATING` regex AND `command.includes(root)` (`.../0.1.0/hooks/lib/pre-tool-use.mjs:4,25-27,40`) | Tokenized: `scanSegments` + 14-verb `DESTRUCTIVE` head set (`hooks/lib/pre-tool-use.mjs:8-11,60-83`) |
| Read-only false positives | ~19 | 0 |
| Known evasions | ~10 | ~21-23 |
| Failure mode | Over-blocks, hard to evade | Ergonomic, easy to evade |

Both are **allow-unless-proven-destructive**. That direction is structurally unfixable: proving destruction requires enumerating every destructive verb, every alias, every wrapper, and every interpreter - an open set. Inversion to **deny-unless-proven-read-only** closes an open set by replacing it with a closed one (a small read-only allowlist).

A live reproduction during this design session confirmed the LIVE guard's canonical false positive class: a read command was denied purely because the command text contained a root path substring and a `>` character. The denial reason returned was the ledger guard's. That is the `2>` / `>>?` bare-redirect false positive, reproduced first-hand.

### Settled evidence carried in (not re-derived)

- The 159-case OLD-vs-TIP harness numbers above are final.
- The `scanSegments` quadratic is not a live hazard at realistic sizes (slowest measured classification 0.29 ms). The cap bounds deliberate abuse only.
- The existing suite is 513 pass / 0 fail *while* 21+ evasions exist. Confirmed locally: `node --test test/unit/hooks/pre-tool-use.test.mjs` produced 23 tests, 23 pass, 0 fail. Green proves nothing about this axis.
- "20 commands regressed" conflated genuine evasion regressions with over-block relaxations the TIP made correctly. Discarded.

### New evidence produced by this design session

Two things measured here are new and load-bearing:

1. **Tokenizer structure for every evasion class** (table below). The whole design rests on it.
2. **The `scanSegments` cost curve past the realistic band**, which sizes the fail-closed cap. The 0.29 ms figure holds for realistic commands (500 B measured at 0.41 ms), but the curve is genuinely quadratic and steep beyond that:

| Command bytes | `scanSegments` ms |
|---|---|
| 500 | 0.41 |
| 2,048 | 1.51 |
| 4,096 | 3.57 |
| 8,192 | 8.00 |
| 12,288 | 15.54 |
| **16,384** | **25.34** |
| 32,768 | 166.54 |
| 65,536 | 755.16 |
| 131,072 | 4,107.03 |
| 262,144 | 16,577.37 |

Measured against `hooks/lib/shell-tokens.mjs` with whitespace-separated single-char tokens (the worst case: token count = bytes/2). A 16 KB command of pure separators (`a;` x 8192) cost only 2.07 ms, confirming the quadratic lives in the token accumulator (`hooks/lib/shell-tokens.mjs:64,72` - `tokens = [...tokens, ...]`), not in segment accumulation.

---

## Tokenizer probe results (frozen `hooks/lib/shell-tokens.mjs`)

Root used: `/Users/satanshumishra/.claude/plugins/data/session-continuity-continuity-ledger/-Users-satanshumishra-Documents-DevLabs--windful-ocean`, abbreviated `<ROOT>`. `{U}` = `unresolvable`. `{R}` = `kind: 'redirect'`. `{O}` = `kind: 'operator'`.

| # | Command | Segs | Head(s) | Token structure | Resolves under root | Root substring |
|---|---|---|---|---|---|---|
| G1 | `( rm -rf <ROOT> )` | 1 | `(` | `"(" "rm" "-rf" "<ROOT>" ")"` | yes | yes |
| G2 | `{ rm -rf <ROOT>; }` | 2 | `{` , `}` | `"{" "rm" "-rf" "<ROOT>"` / `"}"` | yes | yes |
| G3 | `true & rm -rf <ROOT>` | 1 | `true` | `"true" "&" "rm" "-rf" "<ROOT>"` | yes | yes |
| E1 | `(rm -rf <ROOT>)` | 1 | `(rm` | `"(rm" "-rf" "<ROOT>)"` | **no** | yes |
| E2 | `(rm -rf <ROOT>/threads)` | 1 | `(rm` | `"(rm" "-rf" "<ROOT>/threads)"` | yes | yes |
| E4 | `ls <ROOT> & rm -rf <ROOT>` | 1 | `ls` | `"ls" "<ROOT>" "&" "rm" "-rf" "<ROOT>"` | yes | yes |
| E5 | `ls <ROOT>&rm -rf <ROOT>` | 1 | `ls` | `"ls" "<ROOT>&rm" "-rf" "<ROOT>"` | yes | yes |
| P1 | `sudo rm -rf <ROOT>` | 1 | `sudo` | `"sudo" "rm" "-rf" "<ROOT>"` | yes | yes |
| P2 | `FOO=bar rm -rf <ROOT>` | 1 | `FOO=bar` | `"FOO=bar" "rm" "-rf" "<ROOT>"` | yes | yes |
| P3 | `env -i rm -rf <ROOT>` | 1 | `env` | `"env" "-i" "rm" "-rf" "<ROOT>"` | yes | yes |
| E18 | `exec rm -rf <ROOT>` | 1 | `exec` | `"exec" "rm" "-rf" "<ROOT>"` | yes | yes |
| E20 | `nohup rm -rf <ROOT>` | 1 | `nohup` | `"nohup" "rm" "-rf" "<ROOT>"` | yes | yes |
| E21 | `! rm -rf <ROOT>` | 1 | `!` | `"!" "rm" "-rf" "<ROOT>"` | yes | yes |
| E19 | `timeout 5 cat <ROOT>/f` | 1 | `timeout` | `"timeout" "5" "cat" "<ROOT>/f"` | yes | yes |
| S1 | `sh -c 'rm -rf <ROOT>'` | 1 | `sh` | `"sh" "-c" "rm -rf <ROOT>"` | **no** | yes |
| S2 | `bash -c "rm -rf <ROOT>"` | 1 | `bash` | `"bash" "-c" "rm -rf <ROOT>"` | **no** | yes |
| F1 | `find <ROOT> -delete` | 1 | `find` | `"find" "<ROOT>" "-delete"` | yes | yes |
| F2 | `find <ROOT> -type f -exec rm {} \;` | 1 | `find` | `"find" "<ROOT>" "-type" "f" "-exec" "rm" "{}"` | yes | yes |
| GIT1 | `git -C <ROOT> clean -fdx` | 1 | `git` | `"git" "-C" "<ROOT>" "clean" "-fdx"` | yes | yes |
| GIT2 | `git -C <ROOT> reset --hard` | 1 | `git` | `"git" "-C" "<ROOT>" "reset" "--hard"` | yes | yes |
| E8 | `git --git-dir=<ROOT>/.git gc --prune=now` | 1 | `git` | `"git" "--git-dir=<ROOT>/.git" "gc" "--prune=now"` | **no** | yes |
| E9 | `git -c core.x=1 -C <ROOT> clean -fdx` | 1 | `git` | `"git" "-c" "core.x=1" "-C" "<ROOT>" "clean" "-fdx"` | yes | yes |
| X1 | `xargs rm -rf < <ROOT>/list` | 1 | `xargs` | `"xargs" "rm" "-rf" "<"{O} "<ROOT>/list"` | yes | yes |
| X2 | `cat <ROOT>/f \| xargs rm -rf` | 2 | `cat` , `xargs` | `"cat" "<ROOT>/f"` / `"xargs" "rm" "-rf"` | seg0 only | seg0 only |
| A1 | `$'rm' -rf <ROOT>` | 1 | `$rm` | `"$rm" "-rf" "<ROOT>"` | yes | yes |
| E3 | `rm -rf $'<ROOT>'` | 1 | `rm` | `"rm" "-rf" "$<ROOT>"` | **no** | yes |
| E6 | `rm -rf $(echo <ROOT>)` | 1 | `rm` | `"rm" "-rf" "$(echo" "<ROOT>)"` | **no** | yes |
| E7 | ``rm -rf `echo X` `` | 1 | `rm` | ``"rm" "-rf" "`echo" "X`"`` | no | **no** |
| B1 | `cat <ROOT>/x 2>/dev/null` | 1 | `cat` | `"cat" "<ROOT>/x" "2>"{R} "/dev/null"` | yes | yes |
| B2 | `L=<ROOT>/threads; cat "$L/x.json" 2>/dev/null \| python3 -m json.tool` | 3 | `L=<ROOT>/threads` , `cat` , `python3` | `"L=<ROOT>/threads"` / `"cat" "$L/x.json"{U} "2>"{R} "/dev/null"` / `"python3" "-m" "json.tool"` | **no** | seg0 only |
| B4 | `/bin/rm -rf <ROOT>` | 1 | `/bin/rm` | `"/bin/rm" "-rf" "<ROOT>"` | yes | yes |
| O1 | `dd if=/dev/zero of=<ROOT>/f bs=1 count=1` | 1 | `dd` | `"dd" "if=/dev/zero" "of=<ROOT>/f" "bs=1" "count=1"` | **no** | yes |
| O2 | `cp --target-directory=<ROOT> /tmp/x` | 1 | `cp` | `"cp" "--target-directory=<ROOT>" "/tmp/x"` | **no** | yes |
| N2 | `echo x \| tee -a <ROOT>/f` | 2 | `echo` , `tee` | `"echo" "x"` / `"tee" "-a" "<ROOT>/f"` | seg1 | seg1 |
| N3 | `cat > <ROOT>/f <<'EOT'\nhi\nEOT` | 3 | `cat` , `hi` , `EOT` | `"cat" ">"{R} "<ROOT>/f" "<"{O} "<"{O} "EOT"` / `"hi"` / `"EOT"` | seg0 | seg0 |
| E12 | `diff <(cat <ROOT>/a) <(cat <ROOT>/b)` | 1 | `diff` | `"diff" "<"{O} "(cat" "<ROOT>/a)" "<"{O} "(cat" "<ROOT>/b)"` | yes | yes |
| E16 | `rm -rf <ROOT>/../../etc` | 1 | `rm` | `"rm" "-rf" "<ROOT>/../../etc"` | **no** | yes |
| E22 | `for f in <ROOT>/*; do rm -f "$f"; done` | 3 | `for` , `do` , `done` | `"for" "f" "in" "<ROOT>/*"` / `"do" "rm" "-f" "$f"{U}` / `"done"` | seg0 | seg0 |
| E23 | `./cat <ROOT>/f` | 1 | `./cat` | `"./cat" "<ROOT>/f"` | yes | yes |
| R1 | `ls -la <ROOT> 2>&1 \| head -12` | 2 | `ls` , `head` | `"ls" "-la" "<ROOT>" "2>"{R} "&1"` / `"head" "-12"` | seg0 | seg0 |
| R2 | `cat <ROOT>/f 1>&2 2>&1` | 1 | `cat` | `"cat" "<ROOT>/f" "1>"{R} "&2" "2>"{R} "&1"` | yes | yes |
| J1 | `jq '{a:.b}' <ROOT>/f` | 1 | `jq` | `"jq" "{a:.b}" "<ROOT>/f"` | yes | yes |
| J2 | `jq -r '.[] \| select(.x)' <ROOT>/f` | 1 | `jq` | `"jq" "-r" ".[] \| select(.x)" "<ROOT>/f"` | yes | yes |
| FP1 | `find <ROOT> \( -name a -o -name b \)` | 1 | `find` | `"find" "<ROOT>" "(" "-name" "a" "-o" "-name" "b" ")"` | yes | yes |
| E17 | `rm -rf <ROOT>/` | 1 | `rm` | `"rm" "-rf" "<ROOT>/"` | yes | yes |

### The five facts that drive the design

1. **`(`, `)`, `{`, `}`, `&` are ordinary word characters, not separators.** `SEPARATORS` at `hooks/lib/shell-tokens.mjs:1` is exactly `['&&', '||', ';', '\n', '|']`. Grouping and backgrounding do not create segments.
2. **Therefore deny-by-default alone does NOT fix backgrounding.** G3/E4/E5 collapse to a single segment whose head is the *first* command. `ls <ROOT> & rm -rf <ROOT>` has head `ls`. If `ls` is allowlisted, head-only matching **allows a `rm -rf` of the root**. This is a new evasion that inversion *introduces* if the design stops at head matching. It is closed by a guard-level control-split pass (Decision E).
3. **Deny-by-default DOES fix grouping**, but only because `(` and `{` become the *head* (G1, G2) - not because they split. And `(rm` (E1/E2) becomes the head too. Both are non-allowlisted heads.
4. **Path resolution alone is an insufficient scope trigger.** S1, S2, E1, E3, E6, E8, E16, O1, O2 all reference a root and none of them produce a token that `isUnderRoot` accepts (`hooks/lib/ledger-roots.mjs:22-28`). A raw-substring trigger catches every one of them. Only E7 (pure command substitution with no literal root) escapes both - it also escapes both existing guards and is outside any static analysis.
5. **`2>&1` produces a bare `&1` word token after a `{redirect}` token** (R1, R2). Any rule that treats `&` as a control character must exempt this form, or `ls <ROOT> 2>&1 | head` - asserted allowed today at `test/unit/hooks/pre-tool-use.test.mjs:139` - breaks.

---

## Constraints

| Constraint | Source | Effect on design |
|---|---|---|
| `hooks/lib/shell-tokens.mjs` is frozen | Criterion 1 | Every fix lands in `pre-tool-use.mjs`, operating on the token stream the frozen tokenizer emits |
| Quadratic lives in the frozen file | `hooks/lib/shell-tokens.mjs:64,72`; criteria 1 vs 3 tension | Cap **input size** before calling `scanSegments`, never fix the accumulator |
| Over-catch to ask, never under-catch | House precedent, decision 0015 | `ask` is a first-class verdict for the ambiguous population |
| Reads must keep working | Live FP reproduction; TIP's 0-FP baseline | Raw additive union with OLD's predicate is rejected; redirect checking stays target-based |
| Ledger MCP tools stay auto-approved | `hooks/lib/pre-tool-use.mjs:111-113` | Sanctioned write path is unaffected by any of this |
| Out of scope | Mandate | `shell-tokens.mjs` rewrite; ref-level destruction (`git update-ref -d`, `git branch -D`, `.git/worktrees/` deletion); rollout to the other four canonical stores; `ledger-cli sync` |

---

## Proposed pipeline (summary before the decisions)

```
classifyBashCommand(command, roots, baseDir) -> 'deny' | 'ask' | null

  0. SIZE GATE           command.length > 16384 ?
                           references a root by substring -> 'deny'
                           otherwise                      -> null
  1. TOKENIZE            segments = scanSegments(command)
  2. FD-DUP EXEMPT       mark word tokens matching /^&(\d+|-)$/ preceded by a
                         {redirect} token as non-control
  3. CONTROL SPLIT       split each segment into sub-segments on control tokens
  4. CWD TRACK           carry cd across sub-segments in order
  5. PER SUB-SEGMENT     redirect-target-under-root      -> 'deny'
                         in scope ?
                            head normalization fails     -> 'deny'
                            head not on allowlist        -> 'deny'
                            conditional predicate fails  -> 'deny'
                            suspicious residue present   -> 'ask'
  6. OVERLAYS            O1 data-flow  -> 'ask'
                         O2 var-carry  -> 'ask'
  7. otherwise           null (allow)
```

Steps 5-7 only ever run when something in the command names a protected root. **A command that never mentions the ledger store is untouched at step 0/5 and returns `null`.** That is the load-bearing ergonomic guarantee and it is why the Over-Block Bill is bounded.

---

## Decision A - Scope trigger

**Question:** what puts a sub-segment in scope for deny-by-default?

### Options

| Option | Trigger | Catches | Misses |
|---|---|---|---|
| A1 | Resolvable token under root only (TIP's `resolvesUnderRoot`, `hooks/lib/pre-tool-use.mjs:32-37`) | G1-G3, P1-P3, F1-F2, GIT1-2, X1, B4 | **S1, S2, E1, E3, E6, E8, E16, O1, O2** - nine classes |
| A2 | A1 **OR** any token containing a root path as a raw substring | all of the above plus all nine misses | E7 (no literal root anywhere), any root path split across quoting boundaries |
| A3 | A2 plus treat every `unresolvable` token as in-scope | A2 plus `rm -rf "$D"` | Massive false-positive surface: every `"$VAR"` in every command becomes in-scope |

### Trade-off

A1 is the TIP's rule and is precise but has a nine-class blind spot - including `sh -c`, the single most cited hole. A2 borrows exactly one mechanism from the LIVE guard (`referencesRoot`, `.../0.1.0/hooks/lib/pre-tool-use.mjs:25-27`) but uses it **only to widen scope, never to decide the verdict**. That distinction is what keeps the `2>/dev/null` false positive dead: LIVE's FP came from `MUTATING` matching a bare `>`, not from `referencesRoot`. A3 collapses precision.

### Recommendation - A2, with these precise sub-rules

1. **Resolvable trigger.** A word token with `unresolvable !== true` where `isUnderRoot(expandHome(token.text), roots, cwd)` holds. Keeps `expandHome` (`hooks/lib/pre-tool-use.mjs:25-30`) and the `cd`-tracked `cwd`.
2. **Substring trigger.** Any token (any `kind`) whose `text` contains any `root` string via `String.prototype.includes`. This is what catches `sh -c`, `dd of=`, `--git-dir=`, `$'...'`, `$(echo ...)`, and `<ROOT>/../../etc`.
3. **Option-attached paths are in scope.** The TIP drops them at `hooks/lib/pre-tool-use.mjs:71` (`words.slice(1).filter(w => !w.text.startsWith('-'))`). **Delete that filter entirely.** Under inversion there is no reason to look only at operands: scope is computed over *all* tokens, and the head is derived separately. `of=<ROOT>/f` and `--target-directory=<ROOT>` enter scope via rule 2 with no special-casing.
4. **`unresolvable` tokens do NOT trigger scope.** They are handled by overlay O2 (Decision E) and by the suspicious-residue rule (Decision D), not by scope.
5. **Tokens containing `$'`** are not trusted. In practice `$'...'` leaves a `$`-prefixed token (A1: `$rm`; E3: `$<ROOT>`). Two consequences: (a) `$<ROOT>` trips the substring trigger, so it is in scope; (b) a head containing `$` fails head normalization (Decision B) and denies. No separate rule is needed - but the behavior must be pinned by tests, because it is emergent rather than designed.
6. **`expands` flag.** `hooks/lib/shell-tokens.mjs:12` sets `expands: false` for single-quoted regions and `hooks/lib/shell-tokens.mjs:26-28` sets it true for `$`/backtick inside double quotes; it surfaces as `unresolvable`. Treated per rule 4.

**Residual hole:** a root path assembled so no literal substring survives (`/Users/.../session-conti''nuity...`, `$HOME/.claude/plugins/data/...`). Both existing guards share it. Out of reach of static analysis over this tokenizer. Documented, not fixed.

**Confidence: high** for rules 1-4 (directly measured). **Medium** for rule 5 (emergent, must be test-pinned).

---

## Decision B - Head normalization

**Question:** the exact algorithm for deriving the head to match against the allowlist.

### The inverted-basename problem

Deny-by-default fixes basename evasion on the deny side (`/bin/rm` no longer needs to be in a verb set) but **inverts it onto the allowlist**: if the allowlist is matched by basename, `/tmp/attacker/cat` matches `cat`. The allowlist must basename-resolve (so `/usr/bin/cat` works) *and* refuse untrusted directories.

### Recommendation - the algorithm

```
normalizeHead(words) -> { kind, name?, index? }

  i = 0
  loop forever:
    t = words[i]
    if t is undefined                              -> return { kind: 'assignment-only' }
    if /^[A-Za-z_][A-Za-z0-9_]*=/ .test(t.text)    -> i += 1; continue
    if basename(t.text) is in PREFIX_WORDS:
        i += 1
        while words[i] and words[i].text starts with '-'   -> i += 1
        if that prefix takes an operand and words[i] matches its operand shape -> i += 1
        continue
    break

  raw = words[i].text

  if raw contains any of  $ ` ' " \ ( ) { } & * ? [
                                                  -> return { kind: 'obfuscated' }
  if raw contains '/':
      if dirname(raw) not in TRUSTED_BIN_DIRS      -> return { kind: 'untrusted-path' }
      raw = basename(raw)

  return { kind: 'name', name: raw, index: i }
```

**`PREFIX_WORDS`** (stripped): `sudo`, `doas`, `command`, `builtin`, `exec`, `env`, `nohup`, `time`, `timeout`, `stdbuf`, `nice`, `ionice`, `then`, `else`, `do`, `!`.

**Operand-taking prefixes:** `timeout` and `nice`/`ionice` - after flag stripping, skip one token matching `/^[0-9]+(\.[0-9]+)?[smhd]?$/`. `env` needs no operand rule because its `VAR=val` arguments are consumed by the assignment branch.

**`TRUSTED_BIN_DIRS`:** `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`, `/usr/local/bin`, `/usr/local/sbin`, `/opt/homebrew/bin`, `/opt/homebrew/sbin`. Anything else - including `./cat` (E23) and `../x/cat` - returns `untrusted-path`, therefore **deny**.

**Verdicts by `kind`:**

| `kind` | Verdict when the sub-segment is in scope | Why |
|---|---|---|
| `name` | continue to allowlist match | normal path |
| `assignment-only` | **clears** (no deny) | a bare `L=<ROOT>/threads` executes nothing and cannot mutate. This is what unblocks the canonical live FP (B2 seg0). Feeds overlay O2. |
| `obfuscated` | **deny** | `$rm` (A1), `(rm` (E1 - though the control split usually reaches it first), any glob or quote residue in command position |
| `untrusted-path` | **deny** | closes the inverted-basename hole |

### Why prefix-stripping is safe

Stripping can only ever expose a *deeper* head, which must then itself be on the read-only allowlist. Because the allowlist contains no mutating command (Decision C), stripping can never manufacture an ALLOW for a destructive command. `sudo rm -rf <ROOT>` (P1) strips to `rm`, not allowlisted, therefore **deny**, satisfying the named criterion-2 case. `sudo cat <ROOT>/f` strips to `cat` and allows, which is correct (privilege does not make `cat` destructive).

**Trade-off note:** a stricter alternative is to leave `sudo` and `doas` off `PREFIX_WORDS` so that *any* privileged command touching the store denies. It buys little (the deeper head is checked anyway) and costs a small amount of ergonomics. The mandate's trap list names `sudo` for stripping; this design follows it, and flags the alternative as Open User Call 4.

**Confidence: high.** The safety argument is structural, not empirical.

---

## Decision C - The read-only allowlist

**Question:** exact membership, with unconditional and conditional entries distinguished.

### Unconditional (`ALLOW_HEADS`)

| Head | Justification |
|---|---|
| `cat`, `head`, `tail`, `nl`, `wc` | primary file readers; the agent's core ledger inspection |
| `ls`, `stat`, `file`, `du`, `df`, `tree`, `realpath`, `readlink`, `basename`, `dirname`, `pwd` | metadata and path inspection, no write surface |
| `grep`, `egrep`, `fgrep`, `rg` | search. No write capability without a redirect, which is caught independently (Decision F) |
| `jq`, `yq` | structured read of ledger JSON. Neither writes without a redirect |
| `diff`, `cmp` | comparison |
| `sort`, `uniq`, `cut`, `tr`, `column`, `paste`, `join` | stream filters, no file-write flags in common use |
| `md5`, `md5sum`, `shasum`, `sha256sum`, `cksum`, `od`, `xxd`, `strings` | integrity and binary inspection |
| `cd` | required for the `cwd` tracking at `hooks/lib/pre-tool-use.mjs:72-75`; `cd <ROOT>` alone mutates nothing |

### Conditional

| Head | Predicate to ALLOW | Reasoning |
|---|---|---|
| `find` | No token in the sub-segment matches `/^-(delete\|exec\|execdir\|ok\|okdir\|fls\|fprint\|fprint0\|fprintf)$/` | Blanket-allowing `find` hands over `-delete` (F1) and `-exec rm` (F2). The action flags are a small closed set; everything else about `find` is a read |
| `git` | Resolved subcommand is in `GIT_READ_SUBCOMMANDS` **and** subcommand resolution succeeded | Operand awareness is mandatory: `-C <ROOT>` (GIT1/GIT2), `--git-dir=` (E8), `-c k=v -C <ROOT>` (E9) all place a non-flag token before the subcommand |
| `sed` | No token matches `/^-[a-zA-Z]*i/` (reuse `isInPlaceSed`, `hooks/lib/pre-tool-use.mjs:49-51`) **and** none matches `/^--in-place/` | `sed -n 1,20p file` is a legitimate ledger read; `sed -i` is a write |
| `awk` | **OUT** | `print > "file"` and `system()` make every `awk` program an arbitrary writer with no static predicate. Rejecting `awk` costs `test/unit/hooks/pre-tool-use.test.mjs:28` (bill item) |
| `xargs` | **OUT** | the child command is data. `xargs rm -rf < <ROOT>/list` (X1) is the canonical hole. No predicate can make it safe |
| `sh`, `bash`, `zsh`, `dash`, `ksh` | **OUT** | S1/S2 prove the entire command lives in one opaque token. There is nothing to inspect |
| `python`, `python3`, `node`, `perl`, `ruby`, `php` | **OUT** | arbitrary code. `perl -pi -e` is an in-place editor by design |
| `tee`, `dd`, `rsync`, `tar`, `unzip`, `install`, `ln`, `truncate`, `shred` | **OUT** (never added) | writers |
| `echo`, `printf` | **OUT** | *Explicitly* out. Redirects are checked independently, but defense in depth matters here: if `echo` were allowlisted, any future regression in the redirect check would immediately re-open `echo x > <ROOT>/f`. Costs `test/unit/hooks/pre-tool-use.test.mjs:79-80` (bill item) |
| `less`, `more`, `vi`, `vim`, `nano`, `open`, `code` | **OUT** | interactive and/or shell-escaping (`less` has `!cmd`). Useless in an agent Bash context |

**`GIT_READ_SUBCOMMANDS`:** `log`, `show`, `status`, `diff`, `blame`, `cat-file`, `rev-parse`, `rev-list`, `ls-files`, `ls-tree`, `describe`, `shortlog`, `grep`, `whatchanged`.

**Git subcommand resolution algorithm** (walk tokens after the `git` head):

- Valued global options, both `--opt val` and `--opt=val` forms - skip the option and, for the spaced form, its operand: `-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--exec-path`, `--config-env`, `--super-prefix`.
- Valueless global options - skip: `-p`, `--paginate`, `--no-pager`, `--bare`, `--literal-pathspecs`, `--no-literal-pathspecs`, `--glob-pathspecs`, `--icase-pathspecs`, `--no-replace-objects`, `--no-optional-locks`, `--html-path`, `--man-path`, `--info-path`, `--version`, `--help`.
- Any **other** token starting with `-` causes resolution to **fail**, therefore deny. Fail closed on unknown git globals; the list above is stable and complete for practical use.
- The first remaining non-flag token is the subcommand.

This deliberately keeps `git -C <ROOT> show HEAD --stat` allowed (`test/unit/hooks/pre-tool-use.test.mjs:62-63`) while `git -C <ROOT> clean -fdx`, `reset --hard`, `gc`, `commit`, `checkout`, `worktree` all deny.

**Confidence: high** on membership and on `find`/`sed`. **Medium** on the git global-option list being exhaustive - mitigated by failing closed on unknown flags.

---

## Decision D - Verdict vocabulary

**Question:** `deny`/`allow`, or `deny`/`ask`/`allow`?

### Options

| Option | Behavior | Cost |
|---|---|---|
| D1 two-verdict | everything that is not proven read-only denies | Every ambiguous case becomes a hard block. `cat "$L/x.json"`-style workflows and every `&`-bearing command die. Breaks the reads-must-keep-working constraint |
| D2 three-verdict | deny the unambiguous, ask the ambiguous | Interrupts the user on every ambiguous occurrence |
| D3 ask-heavy | ask for everything in scope that is not a bare allowlisted read | Prompt fatigue; users learn to approve reflexively, which is worse than either extreme |

### Recommendation - D2, with these exact populations

**`deny`** (the unambiguous population - the guard can name the problem):
- redirect target resolves under a root (Decision F)
- head normalization returns `obfuscated` or `untrusted-path`
- head is not on the allowlist
- a conditional predicate fails (`find -delete`, `git clean`, `sed -i`)
- the size gate trips on a root-referencing command (Decision G)

**`ask`** (the ambiguous population - the guard can see a risk it cannot resolve):
- **Suspicious residue:** the sub-segment is in scope, all heads cleared, but a token remains that could smuggle a second command past the control split - specifically a token containing a backtick or `$(`, or a token whose text is exactly `(`/`)`/`{`/`}` that survived splitting.
- **Overlay O1 (data flow):** some sub-segment is in scope and runs an allowlisted command, and another sub-segment's normalized head is in `SINK_HEADS`. Example: `cat <ROOT>/f | xargs rm -rf` (X2).
- **Overlay O2 (variable carry):** some in-scope sub-segment is `assignment-only`, and another sub-segment contains an `unresolvable` token *and* has a head in `SINK_HEADS`. Example: `D=<ROOT>; rm -rf "$D"` (`test/unit/hooks/pre-tool-use.test.mjs:84`, currently asserted allowed).

**`SINK_HEADS`:** `rm`, `mv`, `cp`, `dd`, `tee`, `truncate`, `install`, `ln`, `shred`, `chmod`, `chown`, `mkdir`, `rmdir`, `touch`, `xargs`, `sh`, `bash`, `zsh`, `dash`, `ksh`, `awk`, `perl`, `python`, `python3`, `node`, `ruby`, `sed`, `rsync`, `tar`, `git`, `find`.

**`allow` (null)** - everything else, which is the overwhelming majority of all Bash traffic (anything not naming the store) plus every in-scope command whose heads all clear.

### Why `ask` beats denying this population

Both overlays exist precisely because pipeline blindness (`scanSegments` discards which separator was used - `hooks/lib/shell-tokens.mjs:112-117`) makes the guard unable to distinguish `cat <ROOT>/f | xargs rm -rf` from `cat <ROOT>/f && ls`. Denying both is a real ergonomic loss; allowing both leaves `xargs rm -rf` wide open. `ask` shows the user the literal command text and lets a human resolve in one keystroke what no static rule can. This is decision 0015's principle applied where it actually applies.

### UX cost, stated plainly

Every `ask` interrupts. The overlays are scoped narrowly to keep the rate low: O1 requires a *real* in-scope read plus a sink; O2 requires an assignment plus an expansion plus a sink. The canonical live FP (B2) triggers **neither** - its only in-scope sub-segment is `assignment-only` (so O1's "real command" precondition fails) and its `python3` sub-segment carries no `unresolvable` token (so O2's precondition fails). B2 therefore **allows**. That is the discriminator earning its keep.

**Confidence: medium-high.** The verdict split is principled; the exact `SINK_HEADS` membership and the two overlay preconditions are heuristics tuned against the probe set, and should be reviewed after the first week of live use.

---

## Decision E - Segment vs whole-command scoping

**Question:** per-segment scoping, or "any segment in root implies every head must clear"?

### Options

| Option | Rule | X2 pipeline | B2 canonical FP | E11 benign heredoc |
|---|---|---|---|---|
| E1 per-segment | only in-scope segments checked | **allow (hole)** | allow | allow |
| E2 whole-command deny | any segment in scope implies all heads must clear, failures deny | deny | **deny (FP returns)** | **deny (FP)** |
| E3 whole-command ask | same, but out-of-scope failures ask | ask | **ask (friction on the named FP)** | ask |
| **E4 per-segment deny + sink overlays** | deny per-segment; O1/O2 ask across segments | **ask** | **allow** | ask |

### The decisive datapoint

E2 is disqualified outright. Under E2 the canonical live false positive - `L=<ROOT>/threads; cat "$L/x.json" 2>/dev/null | python3 -m json.tool` - denies again, for a *new* reason (`python3` not allowlisted). The mandate names that command as the FP that must not return. E3 softens it to `ask`, which is still friction on the agent's most common ledger-read idiom.

E4 gets X2's hole closed as an `ask` while leaving B2 fully allowed, because the overlay preconditions discriminate: B2's in-scope sub-segment is a bare assignment that produced no ledger data for a downstream sink to consume.

### False-positive bill of the stricter option (E2/E3), quantified

Against the probe set and the existing suite, E2 additionally breaks these commands that E4 allows:

1. `L=<ROOT>/x; cat "$L/f" | python3 -m json.tool` - the named canonical FP
2. `cat <ROOT>/f && python3 - <<'EOT' ... EOT` - heredoc bodies become segments with garbage heads (`print(1)`, `EOT` - probe E11 shows four segments)
3. `ls <ROOT> && npm test` - any unrelated second command in the same invocation
4. `cat <ROOT>/PROJECT.md; git status` - the agent's routine "read then orient" pattern
5. Every heredoc anywhere in a root-referencing command, because heredoc body lines tokenize as independent segments whose first word is arbitrary text (probes N3, E11)

Item 5 alone is disqualifying: heredoc bodies are unbounded arbitrary text and there is no head normalization that can make them clear an allowlist.

### Recommendation - E4, with the control-split pass

Per-segment deny plus sink overlays, **plus a guard-level control-split** that closes the backgrounding and grouping classes the tokenizer does not split:

```
CONTROL_CHARS = & ( ) { }

splitControl(tokens):
  for each token in order:
    if token.kind !== 'word'                     -> emit as-is
    else if token matches /^&(\d+|-)$/ AND the previous emitted token
            has kind === 'redirect'              -> emit as-is
    else if token.text is exactly one of ( ) { } -> boundary
    else if token.text starts with ( or {        -> boundary, then emit the remainder
    else if token.text contains &                -> split on &, boundary at each
    else                                         -> emit as-is
```

The second branch is the fd-dup exemption. The `&` rule applies at every position (E5's glued `<ROOT>&rm` requires it). The `(`/`{` rules apply **only** when standalone or leading - never mid-token - so `jq -r '.[] | select(.x)'` (J2) survives intact. `{a:.b}` (J1) does not, because it leads with `{`; that is a bill item.

The fd-dup exemption is mandatory: without it, `ls -la <ROOT> 2>&1 | head -12` (R1, asserted allowed at `test/unit/hooks/pre-tool-use.test.mjs:139`) would split into a sub-segment headed `1` and deny.

**Effect on the named criterion-2 cases:** `( rm -rf <ROOT> )` (G1) splits to a sub-segment `[rm, -rf, <ROOT>]`, in scope, head `rm`, therefore **deny**. `{ rm -rf <ROOT>; }` (G2) likewise. `ls <ROOT> & rm -rf <ROOT>` (E4) and its glued form (E5) both split and **deny**. `(rm -rf <ROOT>)` (E1) splits at the leading `(` to head `rm`, and the trailing `<ROOT>)` token carries the root substring, so the sub-segment is in scope, therefore **deny**.

**Confidence: high** for the split rules (all directly measured). **Medium** for the overlay preconditions.

---

## Decision F - Redirect handling under inversion

**Question:** does `redirectTargetsRoot` survive, and how is the `2>/dev/null` FP guaranteed dead?

### Recommendation - keep it as an independent hard deny, run per sub-segment, before head checks

`redirectTargetsRoot` (`hooks/lib/pre-tool-use.mjs:39-47`) stays essentially as-is, moved to operate per sub-segment. It is **not** subsumed by Decision A, for two reasons:

1. **Head independence.** A redirect writes regardless of the head. `jq . x > <ROOT>/f` has an allowlisted head and writes into the store. If redirect handling were folded into "scope + allowlist", every allowlisted head would become a write vector.
2. **Defense in depth.** Combined with keeping `echo`/`printf` off the allowlist (Decision C), the classic `echo x > <ROOT>/f` is blocked by two independent mechanisms.

### The `2>/dev/null` guarantee

The false positive is structurally impossible because **the check never inspects the redirect operator text.** It reads `tokens[index].kind === 'redirect'` and then evaluates only `tokens[index + 1]` - the *target* word - against `isUnderRoot`. For `2>/dev/null` the target is `/dev/null`, which is not under any root, so the check returns false regardless of the operator being `2>`, `>`, `>>`, or `>|`.

The LIVE guard's FP came from a completely different mechanism: the `>>?` alternative inside the `MUTATING` regex (`.../0.1.0/hooks/lib/pre-tool-use.mjs:4`) matching the bare `>` character anywhere in the command, ANDed with a substring root reference. **That regex does not exist in this design.** Substring matching survives only as a *scope widener* (Decision A rule 2), never as a verdict input.

This is regression-pinned by three corpus cases: `cat <ROOT>/x 2>/dev/null` (B1), `ls -la <ROOT> 2>&1 | head -12` (R1), and `cat <ROOT>/f 1>&2 2>&1` (R2).

**Additional rules:**
- The `<` input operator (`hooks/lib/shell-tokens.mjs:107-110`) is **not** a write. Its operand is an ordinary word token and contributes to scope only. `xargs rm -rf < <ROOT>/list` (X1) therefore denies on its `xargs` head, not on the redirect.
- Heredoc `<<` produces two `{operator}` tokens plus a delimiter word (probe N3). The heredoc *body* becomes separate segments. Under E4 per-segment scoping those body segments are out of scope, so garbage heads like `print(1)` and `EOT` never deny. `cat > <ROOT>/f <<'EOT'` still denies on the `>` target in the first sub-segment.

**Confidence: high.**

---

## Decision G - Fail-closed size cap

### Where, what threshold, what verdict

**Where:** the first statement of `classifyBashCommand` in `hooks/lib/pre-tool-use.mjs`, **before** `scanSegments` is reached. This satisfies criterion 3 without touching the frozen `hooks/lib/shell-tokens.mjs`, resolving the stated criteria tension: the quadratic stays where it is (`hooks/lib/shell-tokens.mjs:64,72`), and its input is bounded.

**Threshold: `MAX_COMMAND_BYTES = 16384`.**

Justification against measurement: 16 KB of worst-case input (whitespace-separated single-char tokens, 8,000 tokens) costs **25.34 ms** - bounded and imperceptible. The next octave up costs 166 ms, then 755 ms, then 4.1 s at 128 KB and 16.6 s at 256 KB. The settled 0.29 ms slowest-realistic figure corresponds to the sub-1 KB band (500 B measured at 0.41 ms). 16 KB is roughly 32x the largest plausible agent-authored command, so **no realistic command trips it** - exactly as mandated - while worst-case work is capped two octaves below where the curve becomes painful.

**Verdict on trip - split by root reference:**

| Oversized command | Verdict | Reasoning |
|---|---|---|
| contains a root path substring | **`deny`** | fail closed: the guard cannot analyze it and it demonstrably names the protected store |
| contains no root path substring | `null` (allow) | a command that never names a root cannot be classified differently at any size; denying every oversized command would break unrelated large invocations (long `git commit -m` bodies, base64 payloads, generated scripts) with zero security gain |

The substring test is `String.prototype.includes` over at most two roots - linear, safe at any input size, and the only work done on oversized input.

**Residual:** an oversized command could reach a root via `cd` plus relative paths without naming it. Detecting that requires tokenization, which is what the cap forbids. The residual is narrow: it requires the tracked `cwd` to already be inside the store, which never occurs for an agent operating from the project directory. Documented, accepted.

### Do other pathological classes need the same treatment?

Measured: **no.** One byte cap is sufficient.

- **Unterminated quotes** - `readSingleQuoted`/`readDoubleQuoted` (`hooks/lib/shell-tokens.mjs:9-37`) run to end of input, O(n), no blowup.
- **Many segments** - segment accumulation uses `segments.push` (`hooks/lib/shell-tokens.mjs:78`), amortized O(1). Measured: 16 KB of pure separators produced 8,192 segments in **2.07 ms**.
- **One huge token** - the token array stays tiny; the spread cost is O(1) per token.

The quadratic is exclusively in per-token array spreading, and token count is bounded by `bytes / 2`. Capping bytes caps it. No token cap, no segment cap, no timeout needed.

**Confidence: high** - directly measured.

### ANALYSIS ONLY: the three silent allow-paths (NOT designed, NOT in scope without a user decision)

| # | Location | Behavior | Risk |
|---|---|---|---|
| 1 | `hooks/lib/pre-tool-use.mjs:115-117` | `roots.length === 0` returns `{}` | **Total bypass of every check for every tool.** Roots resolve empty when `CLAUDE_PLUGIN_DATA` is unset/empty *and* `gitCommonDir` returns falsy (`hooks/lib/ledger-roots.mjs:5-20`). Any condition that clears that env var silently disables the guard entirely |
| 2 | `hooks/lib/hook-io.mjs:55-57` | `runEntry` catches every exception and sets `exitCode = 0` | Any throw anywhere in classification silently allows. Confirmed shared by **all six** hooks: `hooks/post-tool-use.mjs:5`, `hooks/stop.mjs:5`, `hooks/session-start.mjs:5`, `hooks/pre-compact.mjs:5`, `hooks/pre-tool-use.mjs:5`, `hooks/user-prompt-submit.mjs:5` |
| 3 | `hooks/lib/hook-io.mjs:3-22` | `readHookInput` returns `{}` on stream error or malformed JSON | `classifyPreToolUse` then sees `tool_name: ''` and returns `null`, therefore allow |

**Blast radius of a global fix.** Making `runEntry` fail closed would make an unrelated crash in, say, the Stop hook block the session. Making empty roots deny would deny all Bash and all Write in any project where the plugin data directory is absent. Both are **session-breaking**.

**Cost of a scoped fix.** A PreToolUse-only fail-closed entry - a second exported function in `hooks/lib/hook-io.mjs` (call it `runGuardEntry`) used solely by `hooks/pre-tool-use.mjs`, which emits a `deny` decision on exception and on empty/malformed input when `tool_name` is Bash or a write tool - is roughly 30 LOC plus tests, with **zero blast radius on the other five hooks**. Path 1 would need a matching decision about whether unresolvable roots should deny or allow.

**This REQUIRES A USER SCOPING DECISION.** It is not designed here and is not in the implementation order below. See Open User Call 3.

---

## Decision H - Test architecture

### Fixture shape - table-driven, three corpora

New file `test/unit/hooks/pre-tool-use.corpus.test.mjs` exporting three frozen arrays of `{ id, command, roots, baseDir, expect, why }`:

- `DENY_CORPUS` - `expect: 'deny'`
- `ASK_CORPUS` - `expect: 'ask'`
- `ALLOW_CORPUS` - `expect: null`

A single loop per corpus emits one `test()` per case, so the `node --test` summary reports true counts rather than a hand-tallied number. Cases carry stable ids (`G1`, `E4`, `B2`, ...) matching the probe table in this spec, so a failing test names the evasion class directly.

`roots`/`baseDir` default to the existing `ROOTS = ['/data/-proj/ledger']` convention (`test/unit/hooks/pre-tool-use.test.mjs:13`) and override per case for the `cd`-tracking and spaced-path cases.

**Floors asserted programmatically, not in prose:**

```
test('deny corpus meets the mandated floor', () => {
  assert.ok(DENY_CORPUS.length >= 12);
});
test('allow corpus meets the mandated floor', () => {
  assert.ok(ALLOW_CORPUS.length >= 41);
});
```

**Honesty about 12 and 41.** These figures are **floors with no upstream provenance** - they were not derived from any measurement, and the corpora did not exist as artifacts before this thread. The spec, the fixture file header, the PR body, and the decision record must all state the **actual committed counts** ("N deny, M ask, K allow") and must not present 12/41 as measured findings. The floor assertions exist so the mandate is enforced by the suite rather than by a claim.

### Second new file: tokenizer characterization

`test/unit/hooks/shell-tokens.test.mjs` (does not exist today) pins the probe table's structural facts: that `&`, `(`, `)`, `{`, `}` are word characters; that `2>&1` yields `{redirect}` plus `&1`; that `sh -c '...'` yields one opaque token; that single-quoted regions set `expands: false` (`hooks/lib/shell-tokens.mjs:12`). This admits under the test gate because it defines the **public contract** the guard depends on: the file is frozen by criterion 1, and any future change to it must break loudly rather than silently re-open an evasion.

### Rewriting the existing 51 assertions

`mutatesUnderRoot` returns a boolean; the new engine returns `'deny' | 'ask' | null`. Recommendation: **rename to `classifyBashCommand` and rewrite call sites**, rather than keeping a lossy boolean wrapper that cannot express `ask`.

Assertions whose expected verdict **changes**:

| Location | Command | Today | Under this design | Reason |
|---|---|---|---|---|
| `test/unit/hooks/pre-tool-use.test.mjs:28` | `awk '$1 > 5' <root>/a.json` | `false` | **`deny`** | `awk` not allowlisted (Decision C) |
| `test/unit/hooks/pre-tool-use.test.mjs:79` | `echo "before && rm -rf <root>"` | `false` | **`deny`** | token carries root substring, therefore in scope; `echo` not allowlisted |
| `test/unit/hooks/pre-tool-use.test.mjs:80` | `echo 'x \| rm -rf <root>'` | `false` | **`deny`** | same |
| `test/unit/hooks/pre-tool-use.test.mjs:84` | `D=<root>; rm -rf "$D"` | `false` | **`ask`** | overlay O2 (Decision D) |
| `test/unit/hooks/pre-tool-use.test.mjs:85` | `cd <root> && rm -rf "$D"` | `false` | **`deny`** | seg0 `cd` into root; seg1 head `rm` in tracked-root scope |

Assertions that **keep** their verdict (regression anchors, must not drift): lines 17-19, 23-24, 32, 36-38, 42-44, 48-52, 56, 60-64, 68-72, 76-78, 86-88, 91-92, and every `classifyPreToolUse`/`handlePreToolUse` block at lines 95-192. Note lines 62-63 (`git -C <root> show HEAD --stat`) stay allowed only because `show` is in `GIT_READ_SUBCOMMANDS` and the operand-aware resolver skips `-C <root>` - that pairing is exactly what the git conditional exists to preserve.

### Red-before / green-after protocol (criterion 2)

1. **RED commit.** Commit the three corpora and the tokenizer characterization test **against the unmodified TIP guard**. Run `node --test` and capture the raw runner output. Expectation: every `DENY_CORPUS` evasion case fails, every `ASK_CORPUS` case fails, most `ALLOW_CORPUS` cases pass. Commit message `test(hooks): corpus for deny-by-default guard inversion`.
2. **Record RED evidence.** Paste the verbatim tests/pass/fail block plus the failing case ids into the thread's session log and the decision record. The red state must be reachable later via `git checkout <red-sha> && npm test`.
3. **GREEN commit.** Implement the inversion. Re-run `node --test`. Commit `fix(hooks): invert the PreToolUse Bash guard to deny-by-default`.
4. **Record GREEN evidence.** Full-suite counts (the baseline is 513 pass / 0 fail before the corpora are added; the new baseline is 513 + N + M + K + tokenizer cases).
5. The commit order is load-bearing. A single squashed commit destroys the red-before evidence and fails criterion 2.

**Confidence: high.**

---

## THE OVER-BLOCK BILL

**This is the single thing requiring user approval.**

### The bounding guarantee, stated first

**Any Bash command that does not mention a ledger root path - and does not `cd` into one - is completely untouched.** It short-circuits at Decision A and returns `null`. The bill below applies only to the small population of commands that reference the ledger store directly.

### What KEEPS working (the sanctioned paths)

- **Every ledger MCP tool.** Auto-approved at `hooks/lib/pre-tool-use.mjs:111-113`, before any of this runs. The `lift-off` and `ledgerize` skills orchestrate MCP tools exclusively, so **the agent's sanctioned ledger workflows are entirely unaffected**.
- `cat`, `head`, `tail`, `ls`, `stat`, `wc`, `grep`, `rg`, `jq`, `diff`, `find` (without action flags), `git log/show/status/diff/blame` against the store.
- `cat <ROOT>/x 2>/dev/null`, `ls -la <ROOT> 2>&1 | head -12`, `cat <ROOT>/f 1>&2 2>&1` - all redirect forms whose target is outside the store.
- The canonical live FP `L=<ROOT>/threads; cat "$L/x.json" 2>/dev/null | python3 -m json.tool` - **allowed**, by construction (Decision D's overlay preconditions).
- `cd <ROOT> && ls -la threads`.

### What STOPS working - DENY

| # | Command shape | Example | Why |
|---|---|---|---|
| 1 | `echo` mentioning a root | `echo "ledger lives at <ROOT>"` | `echo` deliberately off the allowlist. Breaks `test/unit/hooks/pre-tool-use.test.mjs:79-80` |
| 2 | `awk` against the store | `awk '$1 > 5' <ROOT>/a.json` | no static predicate can bound `print >` / `system()`. Breaks `test/unit/hooks/pre-tool-use.test.mjs:28` |
| 3 | Interpreters against the store | `python3 -m json.tool <ROOT>/f`, `node -e "...<ROOT>..."`, `perl -ne ... <ROOT>/f` | arbitrary code |
| 4 | Any shell wrapper | `sh -c 'cat <ROOT>/f'`, `bash -lc 'ls <ROOT>'` | the command is one opaque token (probes S1/S2) |
| 5 | Shell compound statements | `for f in <ROOT>/*; do cat "$f"; done`, `while`/`if` over store paths | head is a keyword (`for`, probe E22), not allowlisted |
| 6 | `xargs` naming a root | `xargs cat < <ROOT>/list` | `xargs` off the allowlist even for read children |
| 7 | `find` with any action flag | `find <ROOT> -exec cat {} \;`, `find <ROOT> -fprint /tmp/out` | `-exec` is not distinguishable from `-exec rm` by flag alone |
| 8 | `find` with escaped grouping | `find <ROOT> \( -name a -o -name b \)` | standalone `(`/`)` tokens (probe FP1) trigger the control split; sub-segment head `-name` fails |
| 9 | Non-read `git` against the store | `git -C <ROOT> gc`, `fsck`, `count-objects`, `commit`, `checkout`, `worktree list` | only the 14 read subcommands clear |
| 10 | Any command whose *message text* mentions a root | `git -C <ROOT> commit -m "fix ledger at <ROOT>"` | substring trigger puts it in scope; `commit` is not a read subcommand. **Genuine papercut** |
| 11 | `jq` filters leading with `{` | `jq '{a:.b}' <ROOT>/f` (probe J1) | control split on a leading `{`. Workaround: `jq '.b as $x \| ...'`. Note `jq -r '.[] \| select(.x)'` (J2) is **fine** - mid-token `(` does not split |
| 12 | Archive / sync / pager / editor against the store | `tar -tf <ROOT>/x.tar`, `rsync -n ... <ROOT>/`, `less <ROOT>/f`, `open <ROOT>`, `code <ROOT>` | off the allowlist |
| 13 | Relative or non-system-path heads | `./cat <ROOT>/f`, `~/bin/jq <ROOT>/f` | `untrusted-path` (Decision B), closes inverted-basename evasion |
| 14 | Any root-referencing command over 16 KB | generated scripts pasted inline | fail-closed size gate |

### What STOPS working - ASK (prompt, not block)

| # | Command shape | Example | Trigger |
|---|---|---|---|
| 15 | Pipeline from the store into a sink | `cat <ROOT>/f \| xargs rm -rf`, `grep -c . <ROOT>/f \| awk '{print $1}'` | overlay O1 |
| 16 | Root path in a variable, later consumed by a sink | `D=<ROOT>; rm -rf "$D"` | overlay O2. Changes `test/unit/hooks/pre-tool-use.test.mjs:84` from allow to ask |
| 17 | Read from the store alongside a heredoc-fed interpreter | `cat <ROOT>/f && python3 - <<'EOT' ... EOT` | overlay O1 (`python3` in `SINK_HEADS`) |
| 18 | Command substitution surviving the control split | `cat "$(ls <ROOT>/threads \| head -1)"` | suspicious residue (`$(`) |

### Honest size assessment

**The bill is moderate, and concentrated on ad-hoc inspection rather than on sanctioned workflows.** Items 1-3 and 5 are the ones that will actually be felt day to day; item 10 is the most annoying because it denies a command that touches nothing. Items 4, 6, 7, 9, 12, 13 are correct by construction - every one is a proven or plausible evasion vector. Items 8 and 11 are collateral from the control split and are the strongest candidates for narrowing.

**Available narrowing** (offered as Open User Call 1's fallback): drop the "token *starts with* `(` or `{`" branch of the control split and keep only the standalone form. That recovers items 8 and 11 at the cost of re-opening `(rm -rf <ROOT>/threads)` (probe E2) - a segment whose head becomes the obfuscated `(rm`, which Decision B still denies via the `obfuscated` rule. So the narrowing may in fact be **free**: the `obfuscated` head check catches `(rm` independently. This should be verified in implementation against corpus cases E1/E2 before shipping the wider split.

---

## OPEN USER CALLS

1. **Do you approve the Over-Block Bill above (14 deny classes, 4 ask classes)?**
   *Recommendation: approve.* The bill is bounded by the guarantee that non-store-referencing commands are untouched, and every deny class except items 8, 10, 11 is a proven evasion vector. If items 8 and 11 are unacceptable, take the narrowing above - implementation should first verify that Decision B's `obfuscated` head check independently covers E1/E2, in which case the narrowing costs nothing.

2. **Is `ask` adopted as a third verdict?**
   *Recommendation: yes.* Without it, pipeline blindness forces a choice between a silent hole (`cat <ROOT>/f | xargs rm -rf` allowed) and denying every multi-segment command that reads the store. `ask` is house precedent (decision 0015) and is the only mechanism that resolves the four ambiguous classes correctly. Cost: an interrupt on each occurrence, held low by narrow overlay preconditions.

3. **Are the three silent allow-paths in scope for this thread?**
   *Recommendation: adopt the NARROW variant only* - a PreToolUse-only `runGuardEntry` (~30 LOC plus tests) that fails closed on exception and on empty/malformed input, leaving `runEntry` untouched for the other five hooks. Defer path 1 (`roots.length === 0`) entirely, because deciding whether unresolvable roots should deny requires a product judgment about non-git projects. Explicitly **do not** make `runEntry` globally fail closed - the blast radius is session-breaking across all six hooks.

4. **Should `sudo`/`doas` be stripped as prefix words, or treated as non-allowlisted heads (denying all privileged commands touching the store)?**
   *Recommendation: strip, per the mandate's trap list.* Stripping is provably safe because the exposed head must still clear a read-only allowlist. The stricter variant buys almost nothing.

5. **Should interpreters (`python`, `python3`, `node`, `perl`, `ruby`) sit on `SINK_HEADS`, making them `ask` when downstream of a store read?**
   *Recommendation: yes.* Dropping them removes item 17 from the bill but opens `cat <ROOT>/f | python3 -c '...os.system("rm -rf ...")'` as a silent allow.

6. **Confirm `GIT_READ_SUBCOMMANDS`:** `log, show, status, diff, blame, cat-file, rev-parse, rev-list, ls-files, ls-tree, describe, shortlog, grep, whatchanged`.
   *Recommendation: accept as listed.* Anything absent denies, including `gc`, `fsck`, `reflog`, `config`, and `worktree` - deliberate, since each has a mutating mode. Note that ref-level destruction (`git update-ref -d`, `git branch -D`) is explicitly out of scope for this thread and remains uncovered.

---

## Implementation Order

Keyed to the governing thread's criteria. Each numbered step is one commit.

### Criterion 3 first - fail-closed size cap

1. **`fix(hooks): fail closed on oversized Bash input`** - add `MAX_COMMAND_BYTES = 16384` and the split verdict (deny if the oversized command references a root, allow otherwise) at the top of the Bash branch in `hooks/lib/pre-tool-use.mjs`, before `scanSegments`. Ship with boundary tests at 16383 / 16384 / 16385 bytes, both root-referencing and not. Independent of the inversion, lands first, reversible on its own.

### Criterion 2 (red half) - corpora before implementation

2. **`test(hooks): tokenizer characterization for the frozen shell scanner`** - `test/unit/hooks/shell-tokens.test.mjs`, pinning the probe table's structural facts. Passes immediately against the frozen file; it is a tripwire, not a red test.

3. **`test(hooks): corpus for deny-by-default guard inversion`** - the three corpora, the floor assertions, and the rewritten expectations for the five drifting assertions in `test/unit/hooks/pre-tool-use.test.mjs`. **Run `node --test` here and capture the RED output verbatim** into the session log and decision record, with the failing case ids enumerated. Do not proceed until the red evidence is recorded.

### Criterion 1 - the inversion, built in dependency order

4. **`refactor(hooks): extract head normalization and allowlist tables`** - `normalizeHead`, `PREFIX_WORDS`, `TRUSTED_BIN_DIRS`, `ALLOW_HEADS`, `SINK_HEADS`, `GIT_READ_SUBCOMMANDS`, the git subcommand resolver, and the `find`/`sed` predicates. Pure additions, no behavior change yet. Keeps files small per the house file-organization rule - consider `hooks/lib/command-allowlist.mjs` as a sibling module if `pre-tool-use.mjs` approaches 300 lines.

5. **`fix(hooks): split shell control characters the tokenizer treats as words`** - `splitControl` with the fd-dup exemption. Verified against R1/R2 before anything else depends on it.

6. **`fix(hooks): invert the PreToolUse Bash guard to deny-by-default`** - replace `mutatesUnderRoot` (`hooks/lib/pre-tool-use.mjs:60-83`) with `classifyBashCommand`; wire scope triggers (Decision A), retain `redirectTargetsRoot` as an independent per-sub-segment deny (Decision F), retain `cd` tracking (`hooks/lib/pre-tool-use.mjs:72-75`), **delete the `-`-prefix operand filter at `hooks/lib/pre-tool-use.mjs:71`**, and add the two overlays. Update `classifyPreToolUse` to map `'deny'`/`'ask'` onto `decision(...)` and `null` onto no output.

### Criterion 2 (green half)

7. **Record GREEN evidence** - full-suite `node --test` counts, before and after, into the decision record and the PR body. State the **actual** corpus counts alongside the 12/41 floors, explicitly labelled as floors without upstream provenance.

### Downstream (not owned here)

8. Criterion 4 - full suite green; fresh `code-reviewer` plus `security-reviewer` passes with no CRITICAL or HIGH.
9. Criterion 5 - merge, publish, reinstall, live end-to-end check. The live check should include the reproduction from this session (a read command whose text contains a root path and a `>` character but whose redirect target is outside the store) to confirm the LIVE guard's canonical FP is gone.

---

## Residual risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| Root path assembled to defeat the substring trigger (`$HOME/...`, quote-split) | Medium | Shared by both existing guards. No static fix over this tokenizer. Documented |
| Backtick or `$(cmd)` with no literal root (probe E7) | Medium | Out of reach of both guards. `ask` on suspicious residue catches the in-scope subset only |
| `sed 's/a/b/w out'` write command inside a script expression | Low | Requires cwd already inside the store. Not covered |
| Overlay preconditions (O1/O2) are tuned heuristics | Medium | Review after one week of live use; corpus ids make regressions legible |
| Oversized command reaching a root via `cd` plus relative paths | Low | Requires the agent's cwd to already be the store. Accepted |
| `runEntry` / empty-roots silent allows remain | **High** | **Analyzed, not fixed.** Open User Call 3 |
| Ref-level destruction (`git update-ref -d`, `git branch -D _ledger`, `.git/worktrees/` deletion) | **High** | Explicitly out of scope per the mandate; tracked separately. Note `git update-ref` and `git branch` are not in `GIT_READ_SUBCOMMANDS`, so the *path-referencing* forms deny incidentally - the ref-only forms do not |

---

## Files referenced

- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/hooks/lib/pre-tool-use.mjs`
- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/hooks/lib/shell-tokens.mjs` (frozen)
- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/hooks/lib/ledger-roots.mjs`
- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/hooks/lib/hook-io.mjs`
- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/hooks/pre-tool-use.mjs`
- `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin/test/unit/hooks/pre-tool-use.test.mjs`
- `/Users/satanshumishra/.claude/plugins/cache/continuity-ledger/session-continuity/0.1.0/hooks/lib/pre-tool-use.mjs` (LIVE, comparison only)

No external best-practice claims are made. All claims are grounded in the in-repo files above or in measurements produced during this design session.
