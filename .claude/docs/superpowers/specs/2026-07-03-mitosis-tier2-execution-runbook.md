# Mitosis Cluster-Tier — Tier 2 Execution Runbook (S3 → S5 → N1)

Status: ready-to-execute (authored 2026-07-03, thread `mitosis-cluster-tier-e2e`).
Purpose: a fresh window executes Tier 2 from THIS doc with zero re-grounding. All design decisions,
fixtures, the seeded D6 check, per-run mitosis args, observation plan, and teardown are captured here.
Companion: docs/superpowers/specs/2026-07-02-mitosis-cluster-tier-e2e-test-spec.md (the matrix + §5 design).

## Grounding already done (do NOT re-derive)
- CI (`.github/workflows/receipts.yml`) runs: `npm ci` → receipts enforcer → `node scripts/d6-check.cjs`
  → pr-title-lint. THERE IS NO `npm test` CI STEP. **D6 is the sole cross-MSP semantic gate.**
- receipts enforcer trivially PASSES plain feature PRs (verify.js early-exit for non-fix-claims) — never the gate.
- ALL MSPs in one run SHARE the same scopedCheckCmd/fullValidationCmd (Harden hardcodes them from the
  top-level `verify` arg, mitosis.js:255). So per-MSP verify scoping is done by choosing the RUN's verify.
- Engine integrates each MSP onto `${sourcePrefix}/${mspid}-integration` cut FRESH from origin/baseBranch
  (so a later MSP's worktree already contains earlier merged MSPs). Boundary = fullValidationCmd. Ship does
  fresh-base rebase → push → PR → `gh run watch` (receipts + D6) → squash-merge; JS gate is `if(!ship.merged) halt`.
- args are delivered to mitosis.js's top-level `args` as a JSON STRING even when the Workflow tool is given
  an object; mitosis.js parses either. Pass args as a real JSON object to the Workflow tool.
- Permission posture THIS effort: user chose INTERACTIVE APPROVAL (no settings changes). Surface & APPROVE
  each git/gh prompt so a Ship command is never DENIED (a denial masquerades as a stage:'ship' halt and would
  corrupt N1). Known classifiers: self-merge → [Merge Without Review]; branch delete → [Git Destructive].

## Environment facts (verified 2026-07-03)
- `gh` authed as SatanshuMishra with scopes incl. `delete_repo`, `repo`, `workflow`. Teardown guaranteed.
- receipts plugin installed globally (receipts@receipts).
- Repo to create: `SatanshuMishra/mitosis-cluster-e2e-itest` (PRIVATE). Base branches: `int-s3`,`int-s5`,`int-n1`.
- REPO_ROOT / WORKTREE_ROOT are SESSION-scoped scratchpad paths — the executing session picks fresh absolute
  paths under its own scratchpad and substitutes them into the args below.

## Invocation contract
- Invoke via the **Workflow tool** with `scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js"`
  and `args` = the per-run JSON object below. THIS IS the real-harness load proof — do NOT run mitosis via node.
- Read `<transcriptDir>/journal.jsonl` for agent return values / evidence after each run.

---

## SETUP (delegate to one implementer/devops subagent; approve gh/git prompts)

### Baseline fixture on `main`
`package.json` (ESM, node --test, madge devdep — madge is MANDATORY or D6 silent-passes):
```json
{ "name":"mitosis-cluster-e2e-itest","version":"0.0.0","private":true,"type":"module",
  "engines":{"node":">=18"},"scripts":{"test":"node --test"},"devDependencies":{"madge":"^7.0.0"} }
```
Run `npm install` → commit `package.json` + `package-lock.json` (NOT node_modules).

- `.github/workflows/receipts.yml` — byte copy of skills/mitosis/templates/receipts.yml
- `receipts.config.json` — byte copy of skills/mitosis/templates/receipts.config.json
- `tests/smoke.test.mjs` — `import {test} from 'node:test'; import assert from 'node:assert'; test('smoke',()=>assert.equal(1+1,2));`
- `src/.gitkeep` — empty (MSPs create real src files).
- `scripts/d6-check.cjs` — the SEEDED known-good D6 check below (makes N1 deterministic; do not rely on
  Prepare regenerating it — VERIFY it survived Prepare before trusting N1).

### Seeded `scripts/d6-check.cjs` (CommonJS)
```js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
function arg(flag){ const i=process.argv.indexOf(flag); return i>=0?process.argv[i+1]:null; }
const base=arg('--base'), head=arg('--head');
function changedSourceFiles(b,h){
  return execSync(`git diff --name-only ${b} ${h}`,{encoding:'utf8'}).split('\n').map(s=>s.trim())
    .filter(Boolean).filter(f=>f.startsWith('src/')&&(f.endsWith('.mjs')||f.endsWith('.js')));
}
function testFileFor(srcFile){
  const bn=path.basename(srcFile).replace(/\.(mjs|js)$/,''); const rel=path.dirname(srcFile).replace(/^src\/?/,'');
  return [path.join('tests',rel,`${bn}.test.mjs`),path.join('tests',rel,`${bn}.test.js`),
          `tests/${bn}.test.mjs`,`tests/${bn}.test.js`].find(c=>fs.existsSync(c))||null;
}
(async()=>{
  const changed = base&&head ? changedSourceFiles(base,head) : [];
  if(!changed.length){ console.log('D6: dependents not computed (no changed source files)'); process.exit(0); }
  let madge; try{ madge=require('madge'); }catch(e){ console.log('D6: dependents not computed (madge unavailable)'); process.exit(0); }
  const graph=(await madge('src',{fileExtensions:['js','mjs']})).obj();
  const reverse={};
  for(const [file,deps] of Object.entries(graph)) for(const dep of deps){ const k='src/'+dep; (reverse[k]=reverse[k]||[]).push('src/'+file); }
  const dependents=new Set(); for(const cf of changed) for(const d of (reverse[cf]||[])) dependents.add(d);
  for(const cf of changed) dependents.delete(cf);
  if(!dependents.size){ console.log('D6: no new dependents of changed files -> pass'); process.exit(0); }
  let failed=0,warned=0,checked=0;
  for(const dep of dependents){ const tf=testFileFor(dep);
    if(!tf){ console.log(`D6: WARN dependent ${dep} has no test file`); warned++; continue; }
    checked++;
    try{ execSync(`node --test ${tf}`,{stdio:'inherit'}); console.log(`D6: dependent ${dep} test ${tf} PASS`); }
    catch(e){ console.log(`D6: dependent ${dep} test ${tf} FAIL`); failed++; }
  }
  console.log(`D6: ${checked} checked, ${warned} warned, ${failed} failing`); process.exit(failed>0?1:0);
})();
```

### Three prescriptive SPEC files under `specs/` (committed to main → inherited by all base branches)

`specs/SPEC-S3.md` — 3 MSPs, linear chain, DISJOINT scopes, declared dependsOn only (no imports):
- `s3-a` "feat: add constant a": src/a.mjs (`export const A=1;`) + tests/a.test.mjs (A===1). dependsOn []. fileScope [src/a.mjs,tests/a.test.mjs].
- `s3-b` "feat: add constant b": src/b.mjs (`export const B=2;`) + tests/b.test.mjs. dependsOn [s3-a]. fileScope [src/b.mjs,tests/b.test.mjs].
- `s3-c` "feat: add constant c": src/c.mjs (`export const C=3;`) + tests/c.test.mjs. dependsOn [s3-b]. fileScope [src/c.mjs,tests/c.test.mjs].
- Expected: 1 cluster [s3-a,s3-b,s3-c], addedEdgeCount 0, sequential ship, all green. (Layer-1 non-regression.)

`specs/SPEC-S5.md` — 4 MSPs, TWO independent clusters each a 2-MSP chain, each MSP = 2 independent files
(→ 2-task wave). No imports; leaf dependsOn root (declared). Fully disjoint scopes:
- ALPHA: `alpha-root` (src/alpha/root/one.mjs `export const one=1;`, src/alpha/root/two.mjs `export const two=2;` + mirrored tests, dependsOn [], fileScope [src/alpha/root/**,tests/alpha/root/**]);
  `alpha-leaf` (src/alpha/leaf/three.mjs, four.mjs + tests, dependsOn [alpha-root], fileScope [src/alpha/leaf/**,tests/alpha/leaf/**]).
- BETA: `beta-root`, `beta-leaf` symmetric under src/beta/**, tests/beta/** — fully disjoint from ALPHA.
- Expected: 2 clusters (ALPHA | BETA) run CONCURRENTLY (Layer 1); each MSP a 2-task wave (Layer 2); all 4 ship green.

`specs/SPEC-N1.md` — 2 MSPs, linear chain, DELIBERATE cross-MSP break caught at ship by D6:
- `base-slug` dependsOn []: src/slug.mjs (`export const slugify=(s)=>s.toLowerCase().replace(/\s+/g,'-');`),
  src/title.mjs (`import {slugify} from './slug.mjs'; export const titleSlug=(s)=>slugify(s);`),
  tests/slug.test.mjs (slugify('Hello World')==='hello-world'), tests/title.test.mjs (titleSlug('Hello World')==='hello-world').
  fileScope [src/slug.mjs,src/title.mjs,tests/slug.test.mjs,tests/title.test.mjs].
- `slug-separator` dependsOn [base-slug]: modify src/slug.mjs to `.replace(/\s+/g,'_')`; update tests/slug.test.mjs
  to assert 'hello_world' (its OWN test passes). Do NOT touch title.mjs/title.test.mjs. fileScope [src/slug.mjs,tests/slug.test.mjs].
- Mechanism: slug-separator's own scoped verify passes → reaches ship; D6 computes dependents(src/slug.mjs)={src/title.mjs},
  runs tests/title.test.mjs on fresh base → FAIL → CI red → merged:false. Expected: halted:true, stage:'ship',
  mspId:'slug-separator', merged:false, base int-n1 unchanged past base-slug's squash.

### Publish + branches
Commit all to `main`, `git push -u origin main`; `git branch int-s3 main; git branch int-s5 main; git branch int-n1 main`;
`git push origin int-s3 int-s5 int-n1`.

### Setup verification (MUST pass before any run)
- `npm ci` clean; `node --test` → smoke passes; madge requires OK.
- **D6 sanity proof on a scratch branch (then delete it):** prove `git diff` of a slug `-`→`_` flip makes
  `node scripts/d6-check.cjs --base <A> --head <B>` exit 1 (title.test.mjs caught), and an unrelated change exits 0.
  This validates N1 detection BEFORE spending a real run.
- `gh repo view … --json visibility` → private.

---

## PER-RUN mitosis args (substitute REPO_ROOT / WORKTREE_ROOT with the executing session's paths)

S3:
```json
{ "spec":"<REPO_ROOT>/specs/SPEC-S3.md","repoRoot":"<REPO_ROOT>","baseBranch":"int-s3",
  "sourcePrefix":"s3","worktreeRoot":"<WORKTREE_ROOT>",
  "verify":{"scopedCheckCmd":"npm test","fullValidationCmd":"npm test"} }
```
S5:
```json
{ "spec":"<REPO_ROOT>/specs/SPEC-S5.md","repoRoot":"<REPO_ROOT>","baseBranch":"int-s5",
  "sourcePrefix":"s5","worktreeRoot":"<WORKTREE_ROOT>",
  "verify":{"scopedCheckCmd":"npm test","fullValidationCmd":"npm test"} }
```
N1 (verify SCOPED to slug's own test so slug-separator reaches ship; D6 is the catcher):
```json
{ "spec":"<REPO_ROOT>/specs/SPEC-N1.md","repoRoot":"<REPO_ROOT>","baseBranch":"int-n1",
  "sourcePrefix":"n1","worktreeRoot":"<WORKTREE_ROOT>",
  "verify":{"scopedCheckCmd":"node --test tests/slug.test.mjs","fullValidationCmd":"node --test tests/slug.test.mjs"} }
```

## Execution order + observation plan (checkpoint after EACH)
1. **S3 (canary + load proof).** Expect `{halted:false, shipped.length:3, mspCount:3}`; log line
   `1 cluster(s) -> s3-a>s3-b>s3-c`; 3 PRs squash-merged in chain order; int-s3 = baseline + 3 commits.
   ANY structured return (not an import error) proves **mitosis.js loads under the real harness** (closes that DoD).
   If S3 fails for a HARNESS reason, STOP and fix before S5/N1.
2. **S5 (both layers).** Expect `{halted:false, shipped.length:4}`; log `2 cluster(s) -> alpha-root>alpha-leaf | beta-root>beta-leaf`.
   Layer-1 evidence: interleaved `mitosis[alpha-*]` / `mitosis[beta-*]` log lines + both integration branches
   live concurrently. Layer-2 evidence: engine wave artifacts showing a >1-task wave within an MSP.
   Merge evidence: ordered one-at-a-time base merges across clusters.
3. **N1 (semantic break).** Expect `{halted:true, stage:'ship', mspId:'slug-separator', merged:false}`;
   `git log int-n1` shows base-slug's squash but NOT slug-separator; the slug-separator PR CI shows D6 red on
   tests/title.test.mjs. Read the ship agent's `detail` to CONFIRM the halt reason is D6/title.test.mjs — NOT a
   permission denial or unrelated failure. If N1 ships all green (false green) → D6 missed it: inspect the repo's
   final scripts/d6-check.cjs (did Prepare overwrite the seeded one? did madge miss the edge?), log as a finding,
   decide re-run with user.

## Teardown (after findings logged)
`gh repo delete SatanshuMishra/mitosis-cluster-e2e-itest --yes` (delete_repo scope present).
Remove local REPO_ROOT + WORKTREE_ROOT. Then log Tier 2 findings (pass/fail per fixture, observed evidence,
any product defect) into the thread session log and take the thread through the DoD gate.

## Candidate defects to watch (SPEC §6)
- G-phase: non-namespaced `phase()` under concurrent clusters — Layer-1 legibility on the progress tree may
  race; Layer-1 concurrency is still provable via the `mitosis[<id>]:` log prefixes. Not a functional defect.
- If Prepare regenerates d6-check.cjs weaker than the seeded one (strict "new dependents" filter), N1 may false-green.
  The seeded script + the setup D6 sanity proof are the mitigation; verify the on-repo d6-check.cjs before N1.
