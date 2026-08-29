import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
