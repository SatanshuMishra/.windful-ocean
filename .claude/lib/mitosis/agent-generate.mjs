import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgentDefinitionDir } from './agent-schema-lint.mjs';
import { MANIFEST_RELATIVE_PATH } from './agent-skill-pointers.mjs';
import { compareGeneratedBodies, partitionByPointerNeed, planGeneratedBodies } from './agent-generate-plan.mjs';
import { loadAgentSpecs, realResolverIo, resolveAgentSpecDir } from './agent-spec-store.mjs';
import { halt } from './js-scan.mjs';

export const USAGE = 'usage: node agent-generate.mjs [--check] [--store <dir>] [--agents <dir>]';

const VALUE_FLAGS = Object.freeze({ '--store': 'store', '--agents': 'agents' });

const EXIT_OK = 0;
const EXIT_DIVERGED = 1;
const EXIT_HALTED = 2;

const MODULE_ANCHOR = fileURLToPath(new URL('./', import.meta.url));

export function parseArguments(argv) {
  const parsed = { check: false, store: null, agents: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      parsed.check = true;
      continue;
    }
    const field = VALUE_FLAGS[token];
    if (field === undefined) {
      return halt(`${token} is not a flag this generator accepts; ${USAGE}`);
    }
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      return halt(`${token} needs a directory value; ${USAGE}`);
    }
    parsed[field] = value;
    index += 1;
  }
  return Object.freeze({ ok: true, ...parsed });
}

function resolvedDir(explicit, resolve) {
  if (typeof explicit === 'string' && explicit.length > 0) return Object.freeze({ ok: true, dir: explicit });
  const resolution = resolve();
  if (!resolution.ok) return resolution;
  return Object.freeze({ ok: true, dir: resolution.dir });
}

function readBodyOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function counted(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pluralSpecs(count) {
  return counted(count, 'agent spec', 'agent specs');
}

function pluralBodies(count) {
  return counted(count, 'generated body', 'generated bodies');
}

function pluginManifest(compose) {
  const home = typeof compose.homeDir === 'string' && compose.homeDir.length > 0 ? compose.homeDir : homedir();
  const exists = (compose.deps && compose.deps.exists) || existsSync;
  const path = join(home, MANIFEST_RELATIVE_PATH);
  return Object.freeze({ path, present: exists(path) === true });
}

function unverifiedNotice(manifestPath, deferred) {
  const named = deferred
    .map((entry) => `${entry.spec.name} (${entry.spec.procedures.join(', ')})`)
    .join('; ');
  return `POINTER RESOLUTION UNVERIFIED on this host: the plugin manifest ${manifestPath} does not exist, so ${counted(deferred.length, 'agent spec', 'agent specs')} carrying skill pointers could not be composed and went unchecked: ${named}`;
}

function scopeClause(deferredCount) {
  if (deferredCount === 0) return '';
  return ` (${counted(deferredCount, 'spec', 'specs')} unverified for want of a plugin manifest)`;
}

export async function runAgentGenerate(argv, io = {}) {
  const parsed = parseArguments(argv);
  if (!parsed.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([parsed.error]) });

  const storeDir = resolvedDir(parsed.store, () => resolveAgentSpecDir(MODULE_ANCHOR, realResolverIo));
  if (!storeDir.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([storeDir.error]) });

  const agentsDir = resolvedDir(parsed.agents, () => resolveAgentDefinitionDir(MODULE_ANCHOR, realResolverIo));
  if (!agentsDir.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([agentsDir.error]) });

  const loaded = loadAgentSpecs(storeDir.dir, io);
  if (!loaded.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([loaded.error]) });

  const mode = parsed.check ? 'agent-generate --check' : 'agent-generate';
  if (loaded.entries.length === 0) {
    return Object.freeze({
      code: EXIT_OK,
      lines: Object.freeze([`${mode}: the agent spec store ${storeDir.dir} holds zero agent specs, so no generated body is claimed by a source and nothing was compared`]),
    });
  }

  const compose = io.compose || {};
  const manifest = pluginManifest(compose);
  const scoped = partitionByPointerNeed(loaded.entries, manifest.present);
  if (!scoped.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([scoped.error]) });
  const notice = scoped.deferred.length === 0 ? [] : [unverifiedNotice(manifest.path, scoped.deferred)];
  const scope = scopeClause(scoped.deferred.length);
  const found = `${mode}: ${pluralSpecs(loaded.entries.length)} found`;

  const planned = planGeneratedBodies(scoped.composable, agentsDir.dir, compose);
  if (!planned.ok) return Object.freeze({ code: EXIT_HALTED, lines: Object.freeze([...notice, planned.error]) });

  if (parsed.check) {
    const compared = compareGeneratedBodies(planned.bodies, io.readBody || readBodyOrNull);
    if (!compared.ok) {
      return Object.freeze({
        code: EXIT_DIVERGED,
        lines: Object.freeze([
          ...notice,
          `${found} and ${pluralBodies(compared.divergences.length)} diverging from source${scope}`,
          ...compared.divergences.map((item) => `${item.kind}: ${item.path}\n  ${item.detail}`),
          'regenerate with: node .claude/lib/mitosis/agent-generate.mjs',
        ]),
      });
    }
    const matched = planned.bodies.length === 0
      ? 'no generated body could be compared'
      : `all ${pluralBodies(planned.bodies.length)} matching their source under ${agentsDir.dir}`;
    return Object.freeze({
      code: EXIT_OK,
      lines: Object.freeze([...notice, `${found} and ${matched}${scope}`]),
    });
  }

  const writeBody = io.writeBody || ((path, content) => {
    mkdirSync(agentsDir.dir, { recursive: true });
    writeFileSync(path, content);
  });
  const written = [];
  for (const body of planned.bodies) {
    try {
      writeBody(body.path, body.content);
    } catch (error) {
      return Object.freeze({
        code: EXIT_HALTED,
        lines: Object.freeze([...notice, `${body.path} could not be written from ${body.source}: ${error && error.message ? error.message : String(error)}`]),
      });
    }
    written.push(body.path);
  }
  const produced = written.length === 0
    ? 'no generated body could be written'
    : `${pluralBodies(written.length)} written under ${agentsDir.dir}`;
  return Object.freeze({
    code: EXIT_OK,
    lines: Object.freeze([
      ...notice,
      `${found} and ${produced}${scope}`,
      ...written.map((path) => `wrote: ${path}`),
    ]),
  });
}

const result = await runAgentGenerate(process.argv.slice(2));
for (const line of result.lines) {
  if (result.code === EXIT_OK) process.stdout.write(`${line}\n`);
  else process.stderr.write(`${line}\n`);
}
process.exit(result.code);
