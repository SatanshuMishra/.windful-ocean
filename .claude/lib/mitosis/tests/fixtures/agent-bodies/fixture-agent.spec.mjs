import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_DIR = fileURLToPath(new URL('./', import.meta.url));
export const FIXTURE_HOME = '/fixture/home';
export const FIXTURE_PROJECT = '/fixture/checkout';

const MANIFEST = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture-plugins.json'), 'utf8'));

const PRESENT = new Set([
  join(FIXTURE_HOME, '.claude', 'plugins', 'installed_plugins.json'),
  '/fixture/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/writing-plans/SKILL.md',
  '/fixture/plugins/cache/visual-explainer-marketplace/visual-explainer/0.8.1/SKILL.md',
]);

export const FIXTURE_DEPS = Object.freeze({
  exists: (path) => PRESENT.has(path),
  readJson: () => MANIFEST,
  listDirs: () => [],
});

export const FIXTURE_OPTIONS = Object.freeze({
  homeDir: FIXTURE_HOME,
  projectPath: FIXTURE_PROJECT,
  deps: FIXTURE_DEPS,
});

export const FIXTURE_SPEC = Object.freeze({
  name: 'fixture-composition-agent',
  description: 'Fixture subject for the agent body composition generator and its drift check. Not a dispatchable roster member.',
  tools: Object.freeze(['Read', 'Grep', 'Glob', 'StructuredOutput']),
  model: 'sonnet',
  color: 'blue',
  skills: Object.freeze(['receipts:gates']),
  mcpServers: Object.freeze(['playwright']),
  procedures: Object.freeze(['superpowers:writing-plans', 'visual-explainer:visual-explainer']),
  fragments: Object.freeze(['standards-core', 'delegation-boundary', 'authority-boundary']),
  summary: 'You exist to prove the body composition mechanism can fail. You are never dispatched.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'Lane',
      body: 'You are the fixture the generator composes and the drift check compares against. Every byte of this file is produced from a spec plus shared fragments plus pointers resolved from the plugin manifest.',
    }),
    Object.freeze({
      heading: 'How you work',
      body: 'You do not work. A hand edit to this file turns the drift check red, and a plugin version change turns the pointer lines above red, which is the whole point of the fixture.',
    }),
  ]),
});

export const FIXTURE_BODY_PATH = join(FIXTURE_DIR, `${FIXTURE_SPEC.name}.md`);
