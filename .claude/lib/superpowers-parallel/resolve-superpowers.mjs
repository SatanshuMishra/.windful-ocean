import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

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

export function resolveSkillsDir({ manifestPath, cacheGlobBase, deps = {} }) {
  const exists = deps.exists || existsSync;
  const readJson = deps.readJson || ((p) => JSON.parse(readFileSync(p, 'utf8')));
  const listDirs = deps.listDirs || ((b) => readdirSync(b).filter((d) => statSync(join(b, d)).isDirectory()));

  if (exists(manifestPath)) {
    const m = readJson(manifestPath);
    const entry = m && m.plugins && m.plugins['superpowers@claude-plugins-official'];
    const installPath = Array.isArray(entry) ? (entry[0] && entry[0].installPath) : (entry && entry.installPath);
    if (installPath) {
      const skills = join(installPath, 'skills');
      if (exists(skills)) return { skillsDir: skills, version: installPath.split('/').pop(), source: 'manifest' };
    }
  }
  if (exists(cacheGlobBase)) {
    const versions = listDirs(cacheGlobBase).sort(semverCompare).reverse();
    for (const v of versions) {
      const skills = join(cacheGlobBase, v, 'skills');
      if (exists(skills)) return { skillsDir: skills, version: v, source: 'cache-glob' };
    }
  }
  return null;
}

export function loadPrompts(skillsDir, { snapshotDir, deps = {} } = {}) {
  const exists = deps.exists || existsSync;
  const readFile = deps.readFile || ((p) => readFileSync(p, 'utf8'));
  const out = {};
  for (const [key, rel] of Object.entries(PROMPT_FILES)) {
    const live = join(skillsDir, rel);
    if (exists(live)) { out[key] = { text: readFile(live), source: 'live', path: live }; continue; }
    if (snapshotDir) {
      const snap = join(snapshotDir, key + '.md');
      if (exists(snap)) { out[key] = { text: readFile(snap), source: 'snapshot', path: snap }; continue; }
    }
    throw new Error(`prompt ${key} missing live (${live}) and snapshot`);
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
const SNAPSHOT = join(HOME, '.claude/lib/superpowers-parallel/prompt-snapshots');

export function resolveAll() {
  const r = resolveSkillsDir({ manifestPath: MANIFEST, cacheGlobBase: CACHE });
  if (!r) throw new Error('superpowers not found via manifest or cache');
  const prompts = loadPrompts(r.skillsDir, { snapshotDir: SNAPSHOT });
  const warnings = sanityWarnings(prompts);
  const hashes = Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, hashText(v.text)]));
  return { version: r.version, skillsDir: r.skillsDir, source: r.source, prompts, hashes, warnings };
}

function main() {
  const mode = process.argv[2] || '--state';
  let all;
  try {
    all = resolveAll();
  } catch (e) {
    process.stderr.write('resolve-superpowers error: ' + e.message + '\n');
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

if (import.meta.url === `file://${process.argv[1]}`) main();
