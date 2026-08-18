import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRefToken } from '../checkpoint.mjs';
import { validateRepoIdentity } from '../merge-watch.mjs';
import { PR_TITLE_PATTERN, execGh, resolveGhBinary } from '../../git/pr.mjs';

export const REPO_NAME = 'mitosis-live-pr-harness';
export const BASE_BRANCH = 'main';
export const BRANCH_NAMESPACE = 'live-harness';
export const LIVE_OPT_IN_VAR = 'MITOSIS_LIVE_GH_E2E';

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/live-github-substrate/', import.meta.url));
export const PR_MJS_PATH = fileURLToPath(new URL('../../git/pr.mjs', import.meta.url));

const LABEL_PATTERN = /^[a-z0-9-]+$/;
const NONCE_PATTERN = /^[0-9a-f]{8,32}$/;
const PR_NUMBER_PATTERN = /^[1-9][0-9]*$/;

const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'Mitosis Live Harness',
  GIT_AUTHOR_EMAIL: 'mitosis-live-harness@example.invalid',
  GIT_COMMITTER_NAME: 'Mitosis Live Harness',
  GIT_COMMITTER_EMAIL: 'mitosis-live-harness@example.invalid',
});

export function resolveLiveGate(env) {
  const value = env && typeof env === 'object' ? env[LIVE_OPT_IN_VAR] : undefined;
  if (value !== '1') {
    return Object.freeze({
      optedIn: false,
      reason: `DOWNGRADE-TAG: unverified-reasoned - ${LIVE_OPT_IN_VAR} is not "1"; the live GitHub PR harness was not exercised against a real repository`,
    });
  }
  return Object.freeze({ optedIn: true, reason: null });
}

export function encodeRefForApiPath(ref) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new TypeError(`live-github-harness: refusing to encode a ref that is not a non-empty string: ${JSON.stringify(ref)}`);
  }
  return ref.split('/').map(encodeURIComponent).join('%2F');
}

export function freshNonce() {
  return randomBytes(6).toString('hex');
}

export function deriveRunBranch(label, nonceHex) {
  if (!LABEL_PATTERN.test(label)) {
    throw new TypeError(`live-github-harness: refusing to derive a branch from a label that is not lowercase-kebab: ${JSON.stringify(label)}`);
  }
  if (!NONCE_PATTERN.test(nonceHex)) {
    throw new TypeError(`live-github-harness: refusing to derive a branch from a nonce that is not 8-32 lowercase hex characters: ${JSON.stringify(nonceHex)}`);
  }
  const branch = `${BRANCH_NAMESPACE}/${label}-${nonceHex}`;
  if (!validateRefToken(branch)) {
    throw new Error(`live-github-harness: the composed branch ${JSON.stringify(branch)} fails validateRefToken; refusing to hand pr.mjs a ref it would itself reject`);
  }
  return branch;
}

export function buildPrCreateArgv({ repo, head, base, title, provenance, why, what, notVerified }) {
  if (!validateRepoIdentity(repo)) {
    throw new TypeError(`live-github-harness: refusing to build a pr-create argv for a repo that is not owner/repo: ${JSON.stringify(repo)}`);
  }
  if (!PR_TITLE_PATTERN.test(title)) {
    throw new TypeError(`live-github-harness: refusing to build a pr-create argv for a title that fails the conventional-commits pattern: ${JSON.stringify(title)}`);
  }
  const argv = ['pr-create', '--repo', repo, '--head', head, '--base', base, '--title', title, '--origin', 'machine', '--provenance', provenance];
  for (const value of why) argv.push('--why', value);
  for (const value of what) argv.push('--what', value);
  for (const value of notVerified) argv.push('--not-verified', value);
  return argv;
}

export function buildPrCloseArgv({ repo, pr }) {
  if (!validateRepoIdentity(repo)) {
    throw new TypeError(`live-github-harness: refusing to build a pr-close argv for a repo that is not owner/repo: ${JSON.stringify(repo)}`);
  }
  if (!PR_NUMBER_PATTERN.test(String(pr))) {
    throw new TypeError(`live-github-harness: refusing to build a pr-close argv for a pr number that is not a positive integer: ${JSON.stringify(pr)}`);
  }
  return ['pr-close', '--repo', repo, '--pr', String(pr)];
}

export function parseBranchApiResponse(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  if (typeof json.name !== 'string' || json.name.length === 0) return null;
  const sha = json.commit && typeof json.commit === 'object' ? json.commit.sha : null;
  if (typeof sha !== 'string' || sha.length === 0) return null;
  return Object.freeze({ name: json.name, sha });
}

export function parsePrViewResponse(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  for (const key of ['headRefName', 'baseRefName', 'title', 'url', 'state']) {
    if (typeof json[key] !== 'string' || json[key].length === 0) return null;
  }
  if (!Number.isInteger(json.number)) return null;
  return Object.freeze({
    headRefName: json.headRefName,
    baseRefName: json.baseRefName,
    title: json.title,
    url: json.url,
    state: json.state,
    number: json.number,
  });
}

export function parseOpenedPr(stdout) {
  const trimmed = typeof stdout === 'string' ? stdout.trim() : '';
  if (trimmed.length === 0) return null;
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.url !== 'string' || !Number.isInteger(payload.number)) return null;
  return Object.freeze({ action: payload.action, url: payload.url, number: payload.number });
}

export function resolveGh() {
  const ghBin = resolveGhBinary({ pathValue: process.env.PATH });
  if (!ghBin) {
    throw new Error('live-github-harness: could not resolve a real gh binary on PATH or any pinned fallback');
  }
  return ghBin;
}

function ghJson(ghBin, argv) {
  const result = execGh(ghBin, argv);
  if (result.refused) {
    throw new Error(`live-github-harness: gh call refused: ${result.reason}`);
  }
  if (result.status !== 0) {
    throw new Error(`live-github-harness: gh ${argv.join(' ')} exited ${result.status}: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`live-github-harness: gh ${argv.join(' ')} printed unparseable JSON: ${result.stdout}`);
  }
}

export function resolveOwner(ghBin) {
  const login = execGh(ghBin, ['api', 'user', '-q', '.login']);
  if (login.refused || login.status !== 0) {
    throw new Error(`live-github-harness: could not resolve the authenticated gh login: ${login.reason || login.stderr}`);
  }
  const owner = login.stdout.trim();
  if (owner.length === 0) throw new Error('live-github-harness: gh reported an empty login');
  return owner;
}

export function ensureRepoExists(ghBin, repoSlug) {
  const view = execGh(ghBin, ['repo', 'view', repoSlug, '--json', 'name']);
  if (!view.refused && view.status === 0) return { created: false };
  const create = execGh(ghBin, [
    'repo', 'create', repoSlug, '--private',
    '--description', 'disposable, reusable substrate for the mitosis live github pr harness',
  ]);
  if (create.refused || create.status !== 0) {
    throw new Error(`live-github-harness: could not create ${repoSlug}: ${create.reason || create.stderr}`);
  }
  return { created: true };
}

export function readBackBranch(ghBin, repoSlug, branch) {
  const json = ghJson(ghBin, ['api', `repos/${repoSlug}/branches/${encodeRefForApiPath(branch)}`]);
  const parsed = parseBranchApiResponse(json);
  if (parsed === null) {
    throw new Error(`live-github-harness: the branch read-back for ${branch} returned a shape with no name/commit.sha`);
  }
  return parsed;
}

export function probeBranch(ghBin, repoSlug, branch) {
  const result = execGh(ghBin, ['api', `repos/${repoSlug}/branches/${encodeRefForApiPath(branch)}`]);
  if (result.refused) {
    throw new Error(`live-github-harness: branch probe for ${branch} was refused: ${result.reason}`);
  }
  return Object.freeze({ exists: result.status === 0, status: result.status, stderr: result.stderr });
}

export function readBackPr(ghBin, repoSlug, prNumber) {
  const json = ghJson(ghBin, ['pr', 'view', String(prNumber), '-R', repoSlug, '--json', 'headRefName,baseRefName,title,url,state,number']);
  const parsed = parsePrViewResponse(json);
  if (parsed === null) {
    throw new Error(`live-github-harness: the pull-request read-back for ${repoSlug}#${prNumber} returned an unusable shape`);
  }
  return parsed;
}

export function listOpenPrs(ghBin, repoSlug) {
  const json = ghJson(ghBin, ['pr', 'list', '-R', repoSlug, '--state', 'open', '--json', 'number,headRefName,url']);
  if (!Array.isArray(json)) {
    throw new Error(`live-github-harness: the open-pull-request listing for ${repoSlug} did not return a JSON array`);
  }
  return json;
}

export function listBranchNames(ghBin, repoSlug) {
  const json = ghJson(ghBin, ['api', `repos/${repoSlug}/branches`]);
  if (!Array.isArray(json)) {
    throw new Error(`live-github-harness: the branches listing for ${repoSlug} did not return a JSON array`);
  }
  return json.map((entry) => entry && entry.name).filter((name) => typeof name === 'string').sort();
}

function git(argv, cwd, extraEnv = {}) {
  const result = spawnSync('git', argv, { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) {
    throw new Error(`live-github-harness: git ${argv.join(' ')} in ${cwd} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

export function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), 'mitosis-live-gh-'));
}

export function removeWorkspace(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function ensureSeeded(workDir, repoUrl) {
  git(['clone', repoUrl, workDir], tmpdir());
  const probe = spawnSync('git', ['rev-parse', '--verify', `origin/${BASE_BRANCH}`], { cwd: workDir, encoding: 'utf8' });
  if (probe.status === 0) {
    git(['checkout', BASE_BRANCH], workDir);
    return { seeded: false };
  }
  cpSync(FIXTURE_DIR, workDir, { recursive: true });
  git(['checkout', '-b', BASE_BRANCH], workDir);
  git(['add', '-A'], workDir);
  git(['commit', '-m', 'chore: seed the live github pr harness substrate'], workDir, GIT_IDENTITY);
  git(['push', '-u', 'origin', BASE_BRANCH], workDir);
  return { seeded: true };
}

export function pushRunBranch(workDir, branch, markerFileName, markerBody) {
  git(['checkout', BASE_BRANCH], workDir);
  git(['checkout', '-b', branch], workDir);
  writeFileSync(join(workDir, markerFileName), markerBody);
  git(['add', markerFileName], workDir);
  git(['commit', '-m', `test: record a live harness run marker on ${branch}`], workDir, GIT_IDENTITY);
  git(['push', '-u', 'origin', branch], workDir);
  return git(['rev-parse', 'HEAD'], workDir).trim();
}

export function openPr(argvOpts) {
  const argv = buildPrCreateArgv(argvOpts);
  const result = spawnSync(process.execPath, [PR_MJS_PATH, ...argv], { encoding: 'utf8' });
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

export function closePr(repoSlug, prNumber) {
  const argv = buildPrCloseArgv({ repo: repoSlug, pr: prNumber });
  const result = spawnSync(process.execPath, [PR_MJS_PATH, ...argv], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`live-github-harness: pr.mjs pr-close for ${repoSlug}#${prNumber} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export function deleteBranch(ghBin, repoSlug, branch) {
  const result = execGh(ghBin, ['api', '-X', 'DELETE', `repos/${repoSlug}/git/refs/heads/${encodeRefForApiPath(branch)}`]);
  if (result.refused) {
    throw new Error(`live-github-harness: delete-branch refused: ${result.reason}`);
  }
  if (result.status !== 0) {
    throw new Error(`live-github-harness: deleting branch ${branch} on ${repoSlug} exited ${result.status}: ${result.stderr}`);
  }
}

export function resetToBaseState(ghBin, repoSlug) {
  for (const pr of listOpenPrs(ghBin, repoSlug)) {
    closePr(repoSlug, pr.number);
  }
  for (const name of listBranchNames(ghBin, repoSlug)) {
    if (name === BASE_BRANCH) continue;
    deleteBranch(ghBin, repoSlug, name);
  }
  return Object.freeze({
    openPrs: listOpenPrs(ghBin, repoSlug),
    branches: listBranchNames(ghBin, repoSlug),
  });
}
