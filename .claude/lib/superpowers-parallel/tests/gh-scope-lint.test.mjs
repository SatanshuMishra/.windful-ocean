import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const source = readFileSync(MITOSIS_PATH, 'utf8');

const GH_ACTION = /gh (pr|api|run|issue)\b/g;
const SCOPE_TOKENS = [' -R ', '${repoSlug}'];
const CODE_SPAN_CLOSE = '\\`';
const PLACEHOLDER = '<OWNER_REPO>';
const LIB_DIR_NAME = 'LIB_DIR';
const LIB_DIR_LITERAL = '/Users/satanshumishra/.claude/lib/superpowers-parallel';
const LIB_DIR_TEMPLATE = '${LIB_DIR}';
const PR_CREATE_SITES = 3;
const RECONCILE_PLACEHOLDER_SITES = [
  `gh pr list -R ${PLACEHOLDER} --state merged --base `,
  `gh pr list -R ${PLACEHOLDER} --state open --base `,
];

function ghActionSites(src) {
  const positions = [...src.matchAll(GH_ACTION)].map((m) => m.index);
  return positions.map((start, i) => {
    const bounds = [];
    const closeSpan = src.indexOf(CODE_SPAN_CLOSE, start + 3);
    const newline = src.indexOf('\n', start);
    if (closeSpan >= 0) bounds.push(closeSpan);
    if (newline >= 0) bounds.push(newline);
    if (i + 1 < positions.length) bounds.push(positions[i + 1]);
    const end = bounds.length ? Math.min(...bounds) : src.length;
    return { index: start, command: src.slice(start, end) };
  });
}

function isScoped(command) {
  return SCOPE_TOKENS.some((token) => command.includes(token));
}

test('the engine embeds the known gh action sites (regression tripwire against silent removal)', () => {
  const sites = ghActionSites(source);
  assert.ok(sites.length >= 9, `expected at least the known gh (pr|api|run) action sites, found ${sites.length}`);
});

test('every gh (pr|api|run|issue) command in the engine is repo-scoped and never resolves the ambient cwd repo', () => {
  const unscoped = ghActionSites(source).filter((site) => !isScoped(site.command));
  assert.deepEqual(
    unscoped.map((site) => site.command.trim()),
    [],
    'these gh commands carry no -R / $repoSlug / $(cd ${repoRoot}) scope and would resolve the ambient repository (silent-wrong-repo defect)',
  );
});

test('MSP-2 FIX4: an un-substituted <OWNER_REPO> placeholder is NOT by itself repo scope — the lint must still catch a gh read scoped only by a placeholder', () => {
  assert.equal(isScoped('gh api "repos/<OWNER_REPO>/compare/a...b"'), false, 'a placeholder-only gh read is unscoped: the shell parses <OWNER_REPO> as an input redirection and the command never runs');
  assert.equal(isScoped('gh pr list <OWNER_REPO> --state merged'), false, 'a placeholder without -R is unscoped');
  assert.equal(isScoped('gh pr list -R <OWNER_REPO> --state merged'), true, 'the reconcile sites are scoped by the -R flag itself, not by the placeholder');
});

test('MSP-2 FIX4: the <OWNER_REPO> placeholder is confined to the two whitelisted reconcile list sites, each carrying its own -R flag', () => {
  for (const site of RECONCILE_PLACEHOLDER_SITES) {
    assert.equal(source.split(site).length - 1, 1, `expected exactly one whitelisted placeholder site: ${site}`);
  }
  const offenders = ghActionSites(source)
    .filter((site) => site.command.includes(PLACEHOLDER))
    .filter((site) => !RECONCILE_PLACEHOLDER_SITES.some((allowed) => site.command.startsWith(allowed)))
    .map((site) => site.command.trim());
  assert.deepEqual(offenders, [], 'a gh command may only carry the <OWNER_REPO> placeholder at a whitelisted reconcile list site; anywhere else it is an un-substituted placeholder the shell turns into a redirection');
});

test('the derivation primitive gh repo view is not itself in the pr/api/run/issue set (naturally exempt)', () => {
  assert.ok(source.includes('gh repo view --json nameWithOwner'), 'the target-repo slug derivation primitive is present');
  assert.equal([...'gh repo view'.matchAll(GH_ACTION)].length, 0);
});

test('D7: the target repo slug is derived exactly ONCE — no other prompt asks an agent to resolve nameWithOwner', () => {
  const hits = source.split('gh repo view --json nameWithOwner').length - 1;
  assert.equal(hits, 1, `the slug derivation command must appear exactly once (the reconcile probe); found ${hits} occurrences`);
});

test('D7: no emitted command derives the repo slug through a $( ) subshell or a cd-and-chain', () => {
  assert.equal(source.includes('$(cd '), false, 'a cd-subshell makes the emitted command unmatchable by a literal permission allow-rule');
  assert.equal(source.includes('gh repo view --json nameWithOwner -q .nameWithOwner'), false, 'the -q slug read only ever existed inside the removed subshells');
  assert.equal(source.includes('$repoSlug'), false, 'the slug is an engine-resolved literal, never a shell variable');
});

test('MSP-3: every pull-request-CREATION site emits the anchored mitosis-git wrapper, and none of them still hands the agent a free-form open-PR probe', () => {
  const invocations = source.split(`node ${LIB_DIR_TEMPLATE}/mitosis-git.mjs pr-create`).length - 1;
  assert.equal(invocations, PR_CREATE_SITES, `all ${PR_CREATE_SITES} PR-creation sites (shepherd-open, supersede, ship) must invoke the wrapper; found ${invocations}`);
  assert.equal(source.includes('gh pr list -R ${repoSlug} --head'), false, 'the --head open-PR probe is the observe step the wrapper now owns; emitting it too restores the free-form surface this increment removes');
});

test('MSP-3: the wrapper anchor resolves to one absolute literal a string-matching permission rule can pin, never a tilde', () => {
  assert.ok(source.includes(`const ${LIB_DIR_NAME} = '${LIB_DIR_LITERAL}';`), 'the emitted anchor is the absolute superpowers-parallel path');
  assert.equal(source.includes('~/.claude'), false, 'no emitted command may spell the anchor with a tilde: the permission matcher compares strings, not inodes');
});
