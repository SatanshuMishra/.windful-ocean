import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrompts, sanityWarnings, PROMPT_FILES } from '../resolve-superpowers.mjs';

const SNAPSHOT_DIR = new URL('../prompt-snapshots', import.meta.url).pathname;

const SCAFFOLD_MARKERS = [
  'Task tool (general-purpose):',
  'prompt: |',
  'Use this template when dispatching',
  'Use template at requesting-code-review',
  '{DESCRIPTION}',
  '{PLAN_OR_REQUIREMENTS}',
  '{BASE_SHA}',
  '{HEAD_SHA}',
  '[FULL TEXT',
  '**Placeholders:**',
  '## Example Output',
];

function snapshotText(key) {
  return readFileSync(join(SNAPSHOT_DIR, key + '.md'), 'utf8');
}

for (const key of Object.keys(PROMPT_FILES)) {
  test(`distilled ${key} snapshot carries no dispatcher-facing scaffolding`, () => {
    const text = snapshotText(key);
    for (const marker of SCAFFOLD_MARKERS) {
      assert.ok(
        !text.includes(marker),
        `${key}.md still contains dispatcher scaffolding marker: ${JSON.stringify(marker)}`,
      );
    }
  });
}

test('distilled implementer snapshot preserves the four status tokens and the TDD contract', () => {
  const text = snapshotText('implementer');
  for (const token of ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT']) {
    assert.ok(text.includes(token), `implementer.md dropped status token ${token}`);
  }
  assert.match(text, /TDD/);
});

test('distilled spec reviewer snapshot preserves the do-not-trust-report criterion and a file:line verdict', () => {
  const text = snapshotText('specReviewer');
  assert.match(text, /Do Not Trust the Report/i);
  assert.match(text, /file:line/);
});

test('distilled quality reviewer snapshot preserves the single-responsibility criterion and verdict shape', () => {
  const text = snapshotText('qualityReviewer');
  assert.match(text, /one clear responsibility/);
  assert.match(text, /Strengths/);
});

test('sanityWarnings is empty for the distilled snapshot set', () => {
  const prompts = loadPrompts('/nonexistent/skills', { snapshotDir: SNAPSHOT_DIR });
  assert.deepEqual(sanityWarnings(prompts), []);
});

test('snapshot is pinned: an upstream live prompt cannot re-inject scaffolding', () => {
  const injectedLive =
    'Task tool (general-purpose):\n  prompt: |\n    Use this template when dispatching. DONE BLOCKED NEEDS_CONTEXT DONE_WITH_CONCERNS';
  const deps = {
    exists: () => true,
    readFile: (p) => (p.startsWith(SNAPSHOT_DIR) ? readFileSync(p, 'utf8') : injectedLive),
  };
  const prompts = loadPrompts('/fake/upstream/skills', { snapshotDir: SNAPSHOT_DIR, deps });
  for (const key of Object.keys(PROMPT_FILES)) {
    assert.equal(prompts[key].source, 'snapshot', `${key} resolved from live upstream instead of the pinned snapshot`);
    assert.ok(
      !prompts[key].text.includes('Task tool (general-purpose):'),
      `${key} re-injected scaffolding from live upstream`,
    );
  }
});
