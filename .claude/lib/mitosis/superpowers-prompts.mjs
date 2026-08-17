import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROMPT_FILES = {
  implementer: 'subagent-driven-development/implementer-prompt.md',
  specReviewer: 'subagent-driven-development/spec-reviewer-prompt.md',
  qualityReviewer: 'subagent-driven-development/code-quality-reviewer-prompt.md',
  finalReviewer: 'requesting-code-review/code-reviewer.md',
};

export function semverCompare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export const SUPERPOWERS_PLUGIN_KEY = 'superpowers@claude-plugins-official';

export function selectManifestEntry(entry, pluginKey, projectPath) {
  const entries = Array.isArray(entry) ? entry : (entry ? [entry] : []);
  const usable = entries.filter((candidate) => candidate && typeof candidate.installPath === 'string' && candidate.installPath.length > 0);
  if (usable.length === 0) return null;
  if (projectPath === undefined) return usable[0];
  const scoped = usable.filter((candidate) => candidate.projectPath === projectPath);
  const user = usable.filter((candidate) => candidate.scope === 'user');
  const ranked = scoped.length > 0 ? scoped : (user.length > 0 ? user : usable);
  const distinct = [...new Set(ranked.map((candidate) => candidate.installPath))];
  if (distinct.length > 1) {
    throw new Error(`plugin ${pluginKey} has ${distinct.length} install paths of equal precedence for project ${projectPath} (${distinct.join(', ')}); refusing to guess which one is in force`);
  }
  return ranked[0];
}

export function resolvePluginInstallPath({ manifestPath, cacheGlobBase, pluginKey = SUPERPOWERS_PLUGIN_KEY, projectPath, accept, deps = {} }) {
  if (typeof pluginKey !== 'string' || pluginKey.length === 0) {
    throw new Error('resolving a plugin install path needs a non-empty manifest key such as superpowers@claude-plugins-official');
  }
  const exists = deps.exists || existsSync;
  const readJson = deps.readJson || ((p) => JSON.parse(readFileSync(p, 'utf8')));
  const listDirs = deps.listDirs || ((b) => readdirSync(b).filter((d) => statSync(join(b, d)).isDirectory()));
  const usable = accept || (() => true);

  if (exists(manifestPath)) {
    const m = readJson(manifestPath);
    const selected = selectManifestEntry(m && m.plugins && m.plugins[pluginKey], pluginKey, projectPath);
    const installPath = selected && selected.installPath;
    if (installPath && usable(installPath)) {
      return { installPath, version: installPath.split('/').pop(), source: 'manifest' };
    }
  }
  if (exists(cacheGlobBase)) {
    const versions = listDirs(cacheGlobBase).sort(semverCompare).reverse();
    for (const v of versions) {
      const installPath = join(cacheGlobBase, v);
      if (usable(installPath)) return { installPath, version: v, source: 'cache-glob' };
    }
  }
  return null;
}

export function resolveSkillsDir({ manifestPath, cacheGlobBase, pluginKey = SUPERPOWERS_PLUGIN_KEY, projectPath, deps = {} }) {
  const exists = deps.exists || existsSync;
  const resolved = resolvePluginInstallPath({
    manifestPath,
    cacheGlobBase,
    pluginKey,
    projectPath,
    accept: (installPath) => exists(join(installPath, 'skills')),
    deps,
  });
  if (!resolved) return null;
  return { skillsDir: join(resolved.installPath, 'skills'), version: resolved.version, source: resolved.source };
}

export function loadPrompts(skillsDir, { snapshotDir, deps = {} } = {}) {
  const exists = deps.exists || existsSync;
  const readFile = deps.readFile || ((p) => readFileSync(p, 'utf8'));
  const out = {};
  for (const [key, rel] of Object.entries(PROMPT_FILES)) {
    if (snapshotDir) {
      const snap = join(snapshotDir, key + '.md');
      if (exists(snap)) { out[key] = { text: readFile(snap), source: 'snapshot', path: snap }; continue; }
    }
    const live = join(skillsDir, rel);
    if (exists(live)) { out[key] = { text: readFile(live), source: 'live', path: live }; continue; }
    throw new Error(`prompt ${key} missing pinned snapshot (${snapshotDir}) and live (${live})`);
  }
  return out;
}

export function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const REQUIRED_TOKENS = { implementer: ['DONE', 'BLOCKED', 'NEEDS_CONTEXT'] };

export function sanityWarnings(prompts) {
  const warnings = [];
  for (const [key, tokens] of Object.entries(REQUIRED_TOKENS)) {
    const text = (prompts[key] && prompts[key].text) || '';
    for (const tok of tokens) if (!text.includes(tok)) warnings.push(`prompt ${key} missing expected token: ${tok}`);
  }
  return warnings;
}

const HOME = homedir();
const MANIFEST = join(HOME, '.claude/plugins/installed_plugins.json');
const CACHE = join(HOME, '.claude/plugins/cache/claude-plugins-official/superpowers');
const SNAPSHOT = join(HOME, '.claude/lib/mitosis/prompt-snapshots');

export const WRITING_PLANS_SKILL = 'writing-plans/SKILL.md';

export function libDirectory() {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  return directory.endsWith('/') ? directory.slice(0, -1) : directory;
}

export function writingPlansGlob() {
  return join(CACHE, '*', 'skills', WRITING_PLANS_SKILL);
}

export function resolveAll() {
  const r = resolveSkillsDir({ manifestPath: MANIFEST, cacheGlobBase: CACHE });
  if (!r) throw new Error('superpowers not found via manifest or cache');
  const prompts = loadPrompts(r.skillsDir, { snapshotDir: SNAPSHOT });
  const warnings = sanityWarnings(prompts);
  const hashes = Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, hashText(v.text)]));
  return {
    version: r.version,
    skillsDir: r.skillsDir,
    source: r.source,
    prompts,
    hashes,
    warnings,
    libDir: libDirectory(),
    writingPlansGlob: writingPlansGlob(),
  };
}

function main() {
  const mode = process.argv[2] || '--state';
  let all;
  try {
    all = resolveAll();
  } catch (e) {
    process.stderr.write('superpowers-prompts error: ' + e.message + '\n');
    process.exit(1);
  }
  if (mode === '--prompts') {
    process.stdout.write(JSON.stringify({
      version: all.version,
      source: all.source,
      warnings: all.warnings,
      prompts: Object.fromEntries(Object.entries(all.prompts).map(([k, v]) => [k, v.text])),
    }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ version: all.version, hashes: all.hashes, warnings: all.warnings }) + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
