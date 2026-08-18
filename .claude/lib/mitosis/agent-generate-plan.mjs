import { join } from 'node:path';
import { composeAgentBody } from './agent-body-compose.mjs';
import { firstDifference } from './agent-body-drift.mjs';
import { halt } from './js-scan.mjs';

export const BODY_SUFFIX = '.md';

export function bodyPathFor(agentsDir, name) {
  return join(agentsDir, `${name}${BODY_SUFFIX}`);
}

function lineAt(text, line) {
  const lines = text.split('\n');
  return line >= 1 && line <= lines.length ? lines[line - 1] : '';
}

export function planGeneratedBodies(entries, agentsDir, options = {}) {
  if (!Array.isArray(entries)) {
    return halt('planning generated bodies needs the array of loaded spec entries the store returned');
  }
  if (typeof agentsDir !== 'string' || agentsDir.length === 0) {
    return halt('planning generated bodies needs an explicit agent definition directory to write into');
  }
  const bodies = [];
  for (const entry of entries) {
    let content;
    try {
      content = composeAgentBody(entry.spec, options);
    } catch (error) {
      return halt(`${entry.path} could not be composed into an agent body: ${error && error.message ? error.message : String(error)}`);
    }
    bodies.push(Object.freeze({
      name: entry.spec.name,
      source: entry.path,
      path: bodyPathFor(agentsDir, entry.spec.name),
      content,
    }));
  }
  return Object.freeze({ ok: true, bodies: Object.freeze(bodies) });
}

export function compareGeneratedBodies(bodies, readBody) {
  if (typeof readBody !== 'function') {
    return halt('comparing generated bodies needs a reader that returns the file content or null when it is absent');
  }
  const divergences = [];
  for (const body of bodies) {
    let actual;
    try {
      actual = readBody(body.path);
    } catch (error) {
      divergences.push(Object.freeze({
        kind: 'unreadable',
        path: body.path,
        detail: `the generated body could not be read: ${error && error.message ? error.message : String(error)}`,
      }));
      continue;
    }
    if (actual === null || actual === undefined) {
      divergences.push(Object.freeze({
        kind: 'absent',
        path: body.path,
        detail: `spec ${body.source} names a generated body that is absent; run the generator without --check to write it`,
      }));
      continue;
    }
    const difference = firstDifference(body.content, actual);
    if (difference === null) continue;
    divergences.push(Object.freeze({
      kind: 'drift',
      path: body.path,
      line: difference.line,
      detail: [
        `the generated body diverges from ${body.source} at line ${difference.line} column ${difference.column}`,
        `  expected: ${JSON.stringify(lineAt(body.content, difference.line))}`,
        `  on disk:  ${JSON.stringify(lineAt(actual, difference.line))}`,
      ].join('\n'),
    }));
  }
  return Object.freeze({ ok: divergences.length === 0, divergences: Object.freeze(divergences) });
}
