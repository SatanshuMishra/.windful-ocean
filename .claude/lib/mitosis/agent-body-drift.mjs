import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { composeAgentBody } from './agent-body-compose.mjs';

export const GENERATED_SUFFIX = '.md';

export function enumerateGeneratedBodies(root, deps = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('enumerating generated agent bodies needs an explicit root directory; a relative glob over the working directory silently skips dot-directories such as .claude');
  }
  const listEntries = deps.listEntries || ((dir) => readdirSync(dir, { withFileTypes: true })
    .map((entry) => Object.freeze({ name: entry.name, directory: entry.isDirectory() })));
  const walk = (dir) => {
    let entries;
    try {
      entries = listEntries(dir);
    } catch (error) {
      throw new Error(`the generated-body root ${dir} could not be listed: ${error && error.message ? error.message : String(error)}`);
    }
    return entries
      .slice()
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .flatMap((entry) => (entry.directory
        ? walk(join(dir, entry.name))
        : (entry.name.endsWith(GENERATED_SUFFIX) ? [join(dir, entry.name)] : [])));
  };
  return Object.freeze(walk(root));
}

export function firstDifference(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < limit && expected[index] === actual[index]) index += 1;
  if (index === limit && expected.length === actual.length) return null;
  const before = expected.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return Object.freeze({ offset: index, line, column });
}

function finding(kind, path, detail) {
  return Object.freeze({ kind, path, detail });
}

export function checkBodyDrift({ root, specs, deps = {}, ...options }) {
  if (!Array.isArray(specs)) {
    throw new Error('the drift check needs an array of agent specs to recompose each generated body from');
  }
  const readFile = deps.readFile || ((p) => readFileSync(p, 'utf8'));
  const present = enumerateGeneratedBodies(root, deps);
  const expectedPaths = new Map(specs.map((spec) => [join(root, `${spec && spec.name}${GENERATED_SUFFIX}`), spec]));
  const findings = [];

  for (const path of present) {
    if (expectedPaths.has(path)) continue;
    findings.push(finding('orphan', path, 'this generated body has no source spec, so nothing can recompose it and the census cannot classify it'));
  }

  for (const [path, spec] of expectedPaths) {
    if (!present.includes(path)) {
      findings.push(finding('missing', path, `spec ${spec && spec.name} names a generated body that is absent under ${root}`));
      continue;
    }
    let expected;
    try {
      expected = composeAgentBody(spec, { ...options, deps });
    } catch (error) {
      findings.push(finding('uncomposable', path, `spec ${spec && spec.name} could not be composed: ${error && error.message ? error.message : String(error)}`));
      continue;
    }
    let actual;
    try {
      actual = readFile(path);
    } catch (error) {
      findings.push(finding('unreadable', path, `the generated body could not be read: ${error && error.message ? error.message : String(error)}`));
      continue;
    }
    const difference = firstDifference(expected, actual);
    if (difference === null) continue;
    findings.push(finding('drift', path, `the generated body diverges from its source at line ${difference.line} column ${difference.column}; regenerate it`));
  }

  return Object.freeze({ ok: findings.length === 0, root, checked: present.length, findings: Object.freeze(findings) });
}

export function formatDriftFindings(result) {
  if (result.ok) return `agent body drift check: ${result.checked} generated bodies match their source under ${result.root}`;
  return result.findings.map((item) => `${item.kind}: ${item.path} - ${item.detail}`).join('\n');
}
