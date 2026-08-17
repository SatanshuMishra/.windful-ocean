import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolvePluginInstallPath } from '../../../lib/mitosis/superpowers-prompts.mjs';

const MAX_SKILL_BYTES = 4096;
const QUALIFIED_SHAPE = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;
const BARE_SHAPE = /^[a-z0-9][a-z0-9-]*$/;
const RELATIVE_MD_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.md$/;
const CODE_SPAN = /`([^`\n]+)`/g;
const FENCE = /^\s*```/;

export function defaultSkillDir() {
  const resolved = fileURLToPath(new URL('..', import.meta.url));
  return resolved.endsWith('/') ? resolved.slice(0, -1) : resolved;
}

export function targetSkillDir() {
  const supplied = process.argv[2];
  return supplied && supplied.length > 0 ? supplied.replace(/\/$/, '') : defaultSkillDir();
}

export function stripFences(text) {
  const lines = text.split('\n');
  const kept = lines.reduce(
    (state, line) =>
      FENCE.test(line)
        ? { inside: !state.inside, out: state.out }
        : { inside: state.inside, out: state.inside ? state.out : state.out.concat([line]) },
    { inside: false, out: [] },
  );
  return kept.out.join('\n');
}

export function codeSpans(text) {
  return [...stripFences(text).matchAll(CODE_SPAN)].map((m) => m[1].trim());
}

export function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).sort();
  return names.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' ? [] : markdownFiles(full);
    return name.endsWith('.md') ? [full] : [];
  });
}

export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { ok: false, reason: 'no opening frontmatter delimiter' };
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) return { ok: false, reason: 'no closing frontmatter delimiter' };
  const block = text.slice(4, end + 1);
  const fields = block
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .reduce((acc, line) => {
      const at = line.indexOf(':');
      if (at === -1) return acc;
      return { ...acc, [line.slice(0, at).trim()]: line.slice(at + 1).trim() };
    }, {});
  return { ok: true, fields, body: text.slice(end + 5) };
}

export function projectSkillNames(skillsRoot) {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .filter((name) => {
      const full = join(skillsRoot, name);
      return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
    })
    .sort();
}

export function pluginSkillInventory() {
  const manifestPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (!existsSync(manifestPath)) return { qualified: [], shortNames: new Map(), unresolved: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const keys = Object.keys((manifest && manifest.plugins) || {}).sort();
  const resolutions = keys.map((key) => {
    const plugin = key.split('@')[0];
    const marketplace = key.split('@')[1] || '';
    const cacheGlobBase = join(homedir(), '.claude', 'plugins', 'cache', marketplace, plugin);
    try {
      const found = resolvePluginInstallPath({
        manifestPath,
        cacheGlobBase,
        pluginKey: key,
        accept: (installPath) => existsSync(join(installPath, 'skills')),
      });
      return found
        ? { plugin, skillsDir: join(found.installPath, 'skills') }
        : { plugin, skillsDir: null };
    } catch (error) {
      return { plugin, skillsDir: null, error: error.message };
    }
  });
  const pairs = resolutions
    .filter((entry) => entry.skillsDir !== null)
    .flatMap((entry) =>
      readdirSync(entry.skillsDir)
        .filter((name) => {
          const full = join(entry.skillsDir, name);
          return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
        })
        .map((name) => ({ qualified: `${entry.plugin}:${name}`, short: name })),
    );
  const shortNames = pairs.reduce((acc, pair) => {
    const existing = acc.get(pair.short) || [];
    return new Map(acc).set(pair.short, existing.concat([pair.qualified]));
  }, new Map());
  return {
    qualified: pairs.map((pair) => pair.qualified).sort(),
    shortNames,
    unresolved: resolutions.filter((entry) => entry.skillsDir === null).map((entry) => entry.plugin),
  };
}

export function classifyToken(token, inventory, projectSkills) {
  if (QUALIFIED_SHAPE.test(token)) {
    return inventory.qualified.includes(token)
      ? { branch: 'qualified-resolves', token }
      : { branch: 'qualified-unresolved', token };
  }
  if (BARE_SHAPE.test(token)) {
    if (projectSkills.includes(token)) return { branch: 'project-skill', token };
    const collision = inventory.shortNames.get(token);
    if (collision) return { branch: 'bare-plugin-skill', token, qualifiedForm: collision };
    return { branch: 'not-a-skill-reference', token };
  }
  return { branch: 'not-skill-shaped', token };
}

const SKILL_DIR = targetSkillDir();
const SKILL_MD = join(SKILL_DIR, 'SKILL.md');
const INVENTORY = pluginSkillInventory();
const PROJECT_SKILLS = projectSkillNames(dirname(SKILL_DIR));

test('SKILL.md exists and parses', () => {
  assert.ok(existsSync(SKILL_MD), `SKILL.md missing at ${SKILL_MD}`);
  const text = readFileSync(SKILL_MD, 'utf8');
  const parsed = parseFrontmatter(text);
  assert.ok(parsed.ok, `SKILL.md frontmatter unparseable: ${parsed.reason}`);
  assert.ok(parsed.fields.name, 'SKILL.md frontmatter has no name field');
  assert.ok(parsed.fields.description, 'SKILL.md frontmatter has no description field');
  assert.equal(
    parsed.fields.name,
    basename(SKILL_DIR),
    'frontmatter name must equal the skill directory name, or the preload silently resolves nothing',
  );
  assert.ok(parsed.body.trim().length > 0, 'SKILL.md has no body below the frontmatter');
});

test('SKILL.md is at or under the preload ceiling', () => {
  assert.ok(existsSync(SKILL_MD), `SKILL.md missing at ${SKILL_MD}`);
  const bytes = readFileSync(SKILL_MD).length;
  assert.ok(
    bytes <= MAX_SKILL_BYTES,
    `SKILL.md is ${bytes} bytes, over the ${MAX_SKILL_BYTES} byte preload ceiling`,
  );
  console.log(`SKILL.md measured at ${bytes} bytes (ceiling ${MAX_SKILL_BYTES})`);
});

test('every side file the router names exists', () => {
  assert.ok(existsSync(SKILL_MD), `SKILL.md missing at ${SKILL_MD}`);
  const text = readFileSync(SKILL_MD, 'utf8');
  const named = codeSpans(text).filter(
    (token) => RELATIVE_MD_SHAPE.test(token) && !token.startsWith('/') && !token.startsWith('~'),
  );
  assert.ok(named.length > 0, 'the router names no side file; a router with no routes is not a router');
  const missing = named.filter((rel) => !existsSync(join(SKILL_DIR, rel)));
  assert.deepEqual(
    missing,
    [],
    `router names side files that do not exist: ${missing.map((rel) => join(SKILL_DIR, rel)).join(', ')}`,
  );
  console.log(`router names ${named.length} side files, all present: ${named.join(', ')}`);
});

test('every skill reference is fully qualified', () => {
  const files = markdownFiles(SKILL_DIR);
  assert.ok(files.length > 0, `no markdown found under ${SKILL_DIR}`);
  const classified = files.flatMap((file) =>
    codeSpans(readFileSync(file, 'utf8')).map((token) => ({
      file: relative(SKILL_DIR, file),
      ...classifyToken(token, INVENTORY, PROJECT_SKILLS),
    })),
  );
  const branches = classified.reduce(
    (acc, entry) => ({ ...acc, [entry.branch]: (acc[entry.branch] || 0) + 1 }),
    {},
  );
  assert.equal(
    Object.values(branches).reduce((a, b) => a + b, 0),
    classified.length,
    'the census dropped a token; every token must land in exactly one branch',
  );

  const underQualified = classified.filter((entry) => entry.branch === 'bare-plugin-skill');
  assert.deepEqual(
    underQualified.map((entry) => `${entry.file}: ${entry.token}`),
    [],
    `bare references to plugin-owned skills; use the qualified form: ${underQualified
      .map((entry) => `${entry.token} -> ${entry.qualifiedForm.join(' or ')}`)
      .join(', ')}`,
  );

  const unresolved = classified.filter((entry) => entry.branch === 'qualified-unresolved');
  const qualifiedShaped = classified.filter((entry) => entry.branch.startsWith('qualified-'));
  if (INVENTORY.qualified.length > 0) {
    assert.deepEqual(
      unresolved.map((entry) => `${entry.file}: ${entry.token}`),
      [],
      `qualified-shaped tokens that resolve to no live skill - the census halts rather than guessing. ` +
        `Plugins with no resolvable skills directory here: ${INVENTORY.unresolved.join(', ') || 'none'}`,
    );
  } else {
    assert.ok(
      qualifiedShaped.length > 0,
      'no plugin manifest is readable here, so a resolution census would pass over an empty set; the skill must still carry a qualified reference',
    );
    assert.deepEqual(
      qualifiedShaped.filter((entry) => entry.branch !== 'qualified-unresolved').map((entry) => entry.token),
      [],
      'no plugin manifest is readable, so every qualified reference must land in the unresolved branch; one resolved anyway, which means the census read an inventory it did not report',
    );
    console.log(
      `RESOLUTION UNVERIFIED on this host: no plugin manifest is readable, so the ${qualifiedShaped.length} qualified reference(s) ` +
        `cannot be resolved against a live skill. The qualification rule above still ran; only resolution is unchecked here.`,
    );
  }

  console.log(
    `skill-reference census over ${files.length} files: ${JSON.stringify(branches)}; ` +
      `${INVENTORY.qualified.length} live plugin skills, ${PROJECT_SKILLS.length} live project skills`,
  );
});
