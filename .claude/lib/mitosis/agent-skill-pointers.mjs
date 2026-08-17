import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolvePluginInstallPath } from './superpowers-prompts.mjs';

export const MANIFEST_RELATIVE_PATH = join('.claude', 'plugins', 'installed_plugins.json');
export const PLUGIN_CACHE_RELATIVE_PATH = join('.claude', 'plugins', 'cache');

const QUALIFIED_REFERENCE = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/;

export function parseSkillReference(reference) {
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error('a skill reference must be a non-empty string of the form plugin:skill');
  }
  const parsed = QUALIFIED_REFERENCE.exec(reference);
  if (!parsed) {
    throw new Error(`skill reference ${JSON.stringify(reference)} is not fully qualified as plugin:skill, so it names no plugin to resolve an install path from; bare skill names are forbidden`);
  }
  return Object.freeze({ plugin: parsed[1], skill: parsed[2] });
}

export function resolveManifestKey(manifest, pluginName, manifestPath) {
  const plugins = manifest && manifest.plugins;
  if (!plugins || typeof plugins !== 'object') {
    throw new Error(`${manifestPath} carries no plugins object, so no plugin named ${pluginName} can be located in it`);
  }
  const prefix = `${pluginName}@`;
  const matching = Object.keys(plugins).filter((key) => key.startsWith(prefix));
  if (matching.length === 0) {
    throw new Error(`no plugin named ${pluginName} is installed according to ${manifestPath}; its installed keys are ${Object.keys(plugins).join(', ')}`);
  }
  if (matching.length > 1) {
    throw new Error(`plugin name ${pluginName} is ambiguous in ${manifestPath}: it is provided by ${matching.join(' and ')}; refusing to guess which marketplace is meant`);
  }
  return matching[0];
}

export function skillFileCandidates(installPath, plugin, skill) {
  const nested = join(installPath, 'skills', skill, 'SKILL.md');
  if (skill === plugin) return Object.freeze([nested, join(installPath, 'SKILL.md')]);
  return Object.freeze([nested]);
}

export function resolveSkillPointer({ reference, homeDir, projectPath, deps = {} }) {
  const exists = deps.exists || existsSync;
  const readJson = deps.readJson || ((p) => JSON.parse(readFileSync(p, 'utf8')));
  const home = homeDir === undefined ? homedir() : homeDir;
  if (typeof home !== 'string' || home.length === 0) {
    throw new Error(`resolving ${reference} needs a non-empty home directory to locate the plugin manifest under`);
  }
  const { plugin, skill } = parseSkillReference(reference);
  const manifestPath = join(home, MANIFEST_RELATIVE_PATH);
  if (!exists(manifestPath)) {
    throw new Error(`the plugin manifest ${manifestPath} does not exist, so ${reference} cannot be resolved to an absolute path`);
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    throw new Error(`the plugin manifest ${manifestPath} could not be parsed while resolving ${reference}: ${error && error.message ? error.message : String(error)}`);
  }

  const pluginKey = resolveManifestKey(manifest, plugin, manifestPath);
  const marketplace = pluginKey.slice(plugin.length + 1);
  const cacheGlobBase = join(home, PLUGIN_CACHE_RELATIVE_PATH, marketplace, plugin);

  const resolved = resolvePluginInstallPath({
    manifestPath,
    cacheGlobBase,
    pluginKey,
    projectPath,
    accept: (installPath) => skillFileCandidates(installPath, plugin, skill).some(exists),
    deps: { ...deps, readJson: () => manifest },
  });

  if (!resolved) {
    throw new Error(`${reference} resolved to no readable SKILL.md: neither the ${pluginKey} entry in ${manifestPath} nor any version under ${cacheGlobBase} carries ${join('skills', skill, 'SKILL.md')}`);
  }

  const path = skillFileCandidates(resolved.installPath, plugin, skill).find(exists);
  return Object.freeze({
    reference,
    plugin,
    skill,
    pluginKey,
    path,
    installPath: resolved.installPath,
    version: resolved.version,
    source: resolved.source,
  });
}

export function resolveSkillPointers(references, options = {}) {
  if (!Array.isArray(references)) {
    throw new Error('resolving skill pointers needs an array of plugin:skill references');
  }
  return Object.freeze(references.map((reference) => resolveSkillPointer({ ...options, reference })));
}
