import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAgentSpec } from './agent-body-compose.mjs';
import { realResolverIo, resolveCanonicalConfigDir } from './canonical-config-dir.mjs';
import { halt } from './js-scan.mjs';

export const SPEC_SUFFIX = '.spec.mjs';

export const SPEC_SEGMENTS = Object.freeze(['lib', 'mitosis', 'agent-specs']);

const SPEC_SUBJECT = Object.freeze({
  canonical: 'the canonical agent spec store',
  bare: 'agent spec store',
  served: 'every generated agent body is composed from',
});

const MODULE_ANCHOR = fileURLToPath(new URL('./', import.meta.url));

export { realResolverIo };

export function resolveAgentSpecDir(anchorDir = MODULE_ANCHOR, io = realResolverIo) {
  return resolveCanonicalConfigDir(anchorDir, SPEC_SEGMENTS, SPEC_SUBJECT, io);
}

function failureText(error) {
  return error && error.message ? error.message : String(error);
}

function defaultListEntries(dir) {
  return readdirSync(dir, { withFileTypes: true }).map((entry) => Object.freeze({
    name: entry.name,
    file: entry.isFile(),
  }));
}

export function enumerateSpecFiles(dir, deps = {}) {
  if (typeof dir !== 'string' || dir.length === 0) {
    return halt('enumerating agent specs needs an explicit store directory; a relative glob over the working directory silently skips dot-directories such as .claude');
  }
  const listEntries = deps.listEntries || defaultListEntries;
  let entries;
  try {
    entries = listEntries(dir);
  } catch (error) {
    return halt(`the agent spec store ${dir} could not be listed: ${failureText(error)}; an unreadable store is not an empty store, so this generator refuses to report a clean result over it`);
  }
  const files = entries
    .filter((entry) => entry.file && entry.name.endsWith(SPEC_SUFFIX))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => join(dir, name));
  return Object.freeze({ ok: true, dir, files: Object.freeze(files) });
}

function defaultImportModule(path) {
  return import(pathToFileURL(path).href);
}

export async function loadAgentSpecs(dir, deps = {}) {
  const enumerated = enumerateSpecFiles(dir, deps);
  if (!enumerated.ok) return enumerated;
  const importModule = deps.importModule || defaultImportModule;
  const entries = [];
  for (const path of enumerated.files) {
    let module;
    try {
      module = await importModule(path);
    } catch (error) {
      return halt(`${path} could not be loaded as an agent spec module: ${failureText(error)}`);
    }
    const spec = module ? module.default : undefined;
    if (spec === undefined || spec === null) {
      return halt(`${path} default-exports nothing; every file in the agent spec store default-exports exactly one agent spec`);
    }
    try {
      validateAgentSpec(spec);
    } catch (error) {
      return halt(`${path} does not carry a valid agent spec: ${failureText(error)}`);
    }
    const stem = basename(path, SPEC_SUFFIX);
    if (spec.name !== stem) {
      return halt(`${path} declares name ${JSON.stringify(spec.name)} but its filename stem is ${JSON.stringify(stem)}; the filename and the name both address one agent and this loader cannot tell which is meant; refusing to guess`);
    }
    entries.push(Object.freeze({ path, spec }));
  }
  return Object.freeze({ ok: true, dir, entries: Object.freeze(entries) });
}
