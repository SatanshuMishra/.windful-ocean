---
Status: accepted
Date: 2026-07-31T19:04:37.847Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0158. The m2 mirror-gaps plan becomes tracked; the plans directory stays ignored

## Context

docs/superpowers/plans/ is excluded wholesale at .gitignore:22, while docs/superpowers/specs/ is tracked (9 specs committed). The 2026-07-31-m2-mirror-gaps.md plan (369 lines, 37KB) is therefore invisible to a clean checkout and to CI. It is not a scratch artifact: decisions 0156 and 0157 rest on it, its re-derived anchors at 1bb149d are the authority that overrides the stale 450804e spec anchors, PR bodies for P1 through P5 cite its file:line claims, and its section 10 carries the coverage-entry rationale for all five PRs. This is the third instance of this repo's ignore rules swallowing load-bearing work. A leak scan for the confidential project codename returns 0 hits, so tracking it is safe.

## Options

- Accept machine-local: leave the plan ignored, rely on decision records 0154-0157 as the durable trace
- Un-ignore the whole plans directory by deleting .gitignore:22
- Track this one plan: rewrite .gitignore:22 as /docs/superpowers/plans/* plus an explicit negation for this file
- git add -f the file without touching .gitignore

## Outcome

Track this one plan via the directory-contents-plus-negation form. Rewrite .gitignore:22 from /docs/superpowers/plans/ to /docs/superpowers/plans/* and add !/docs/superpowers/plans/2026-07-31-m2-mirror-gaps.md. The trailing-slash form cannot be negated at all, because git refuses to re-include a file whose parent directory is excluded, so the /* rewrite is required rather than cosmetic. Accepting machine-local was rejected because five PR bodies cite anchors a reviewer could not open, and because re-deriving 369 lines of measurement after a clean checkout is the exact cost the plan was written to avoid. Un-ignoring the directory wholesale was rejected as a policy change that sweeps in genuine scratch plans; the specs-tracked/plans-ignored split stays deliberate. git add -f was rejected because it leaves no readable statement of intent in the repo, so the next contributor sees a tracked file inside an ignored directory with no explanation. Lands as its own docs PR ahead of P1 so citations in P1 through P5 resolve at review time.
