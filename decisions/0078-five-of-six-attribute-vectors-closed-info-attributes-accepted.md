---
Status: accepted
Date: 2026-07-28T19:37:23.329Z
Thread-Id: 01KYKS3C7VP16PXMP7D9G0TMHW
---

# 0078. Five of six attribute vectors closed; info/attributes accepted as the residual gap

## Context

The predecessor recorded, as verified: "isolatedScope still loads the repo's own .git/config and info/attributes, so a repo-local content filter or merge driver executes during the ledger's add/merge." True but imprecise. An empirical investigation (git 2.55.0, raw-git reproductions driven through the repo's real isolatedScope/scopedExec/ledgerCommitEnv) enumerated the attribute sources actually visible from the ledger's linked worktree. A filter or merge driver runs only when BOTH the user's local .git/config defines it AND some visible attribute source attaches it to a ledger path. Six sources tested: the user's checked-out branch .gitattributes is CLOSED (the worktree checks out the _ledger tree, so their tree-level attributes are absent - the predecessor's framing overstated this). LIVE: .git/info/attributes; local core.attributesFile; the system attributes file; the per-user XDG attributes file; and the sharpest case, the ledger's OWN shipped `sessions/**/*.md merge=union`, where a local `[merge "union"] driver` overrides git's built-in union driver, so one config key alone gets an arbitrary program run against ledger session files with its output committed.

## Options

- Accept the whole content-filter gap as the predecessor framed it
- Close every closable vector and accept only what has no per-invocation fix
- Rewrite the driver's write path onto attribute-immune plumbing

## Outcome

Close every closable vector; accept only .git/info/attributes. core.attributesFile and the XDG per-user file close with `-c core.attributesFile=<devNull>`; the system file closes with env GIT_ATTR_NOSYSTEM=1; the union hijack closes by OVERRIDING merge.union.driver with `git merge-file --union -L ours -L base -L theirs %A %O %B`, verified byte-identical to the clean-machine built-in union. The three obvious disable spellings were rejected on evidence: empty value, `false`, and the valueless form each BREAK union merges (exit 1 with the path unmerged, or exit 128 config parse error). info/attributes has no per-invocation fix at all - it holds the highest precedence and defeats --attr-source, attr.tree and core.attributesFile alike; the only escapes are architectural (plumbing writes that never consult attributes, which would not cover the merge path). Two caveats recorded deliberately: GIT_ATTR_NOSYSTEM is genuinely undocumented in git 2.55.0's man pages though present and working, so if it were removed vector 5 reopens silently with no error and no test failure; and a system-attributes-file regression test is not practical in CI, so this record is the mitigation. Rewriting the write path onto plumbing was rejected as not cheap and not sufficient.
