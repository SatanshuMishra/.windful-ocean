import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const source = readFileSync(MITOSIS_PATH, 'utf8');

const GH_ACTION = /gh (pr|api|run|issue)\b/g;
const SCOPE_TOKENS = [' -R ', '${repoSlug}', '<OWNER_REPO>'];
const CODE_SPAN_CLOSE = '\\`';

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
