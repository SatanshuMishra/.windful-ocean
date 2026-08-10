import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_HOOK_COMMANDS,
  GOOD_SH,
  assertLiveUntouched,
  assertRejected,
  cleanup,
  commitChange,
  hookSettings,
  makeHome,
  makeRepo,
  settingsFor,
  writeFile,
} from './_fixture.mjs';
import { liveSha, promote, rollback, settingsNotices, swapPointer } from '../promote.mjs';
import { collectGarbage, listReleases } from '../release.mjs';
import { readReceipt } from '../receipt.mjs';
import { RECEIPT_FIELDS } from '../receipt.mjs';
import { FLAG_UNCLASSIFIED } from '../manifest.mjs';

const NOW = '2026-08-07T12:00:00.000Z';
const WITHDRAWN = 'Bash(ln -sfn:*)';

function scenario({ mutate } = {}) {
  const { repoRoot, sha } = makeRepo({ mutate });
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, DEFAULT_HOOK_COMMANDS);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    settingsPath,
    run: (overrides = {}) => promote({
      configRoot,
      repoRoot,
      ref: 'main',
      now: NOW,
      settingsPath,
      home,
      ...overrides,
    }),
    dispose: () => cleanup(repoRoot, home),
  };
}

const render = (document) => `${JSON.stringify(document, null, 2)}\n`;

const declaredSettings = (commands = DEFAULT_HOOK_COMMANDS) => ({
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  includeCoAuthoredBy: false,
  ...hookSettings(commands),
  permissions: { allow: ['Bash(node --test:*)'], deny: ['Bash(gh pr merge:*)'] },
});

const liveSettings = (extra = {}) => ({
  ...hookSettings(['$HOME/.claude/hooks/good.sh']),
  includeCoAuthoredBy: true,
  model: 'claude-fable-5[1m]',
  pluginConfigs: { 'logbook@logbook': { options: { ledger_backend: 'orphan-branch' } } },
  permissions: { allow: [WITHDRAWN, 'Bash(node:*)'], deny: [] },
  ...extra,
});

function settingsScenario({ declared = declaredSettings(), live = liveSettings(), settingsDir } = {}) {
  const { repoRoot, sha } = makeRepo({
    mutate: declared === null
      ? undefined
      : (claude) => writeFile(join(claude, 'settings.json'), render(declared)),
  });
  const { home, configRoot } = makeHome();
  const holder = settingsDir === undefined ? configRoot : join(configRoot, settingsDir);
  const settingsPath = join(holder, 'settings.json');
  writeFile(settingsPath, render(live));
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    holder,
    settingsPath,
    declared,
    live,
    text: () => readFileSync(settingsPath, 'utf8'),
    applied: () => JSON.parse(readFileSync(settingsPath, 'utf8')),
    run: (overrides = {}) => promote({
      configRoot,
      repoRoot,
      ref: 'main',
      now: NOW,
      settingsPath,
      home,
      ...overrides,
    }),
    dispose: () => cleanup(repoRoot, home),
  };
}

test('promotion applies the repo-owned settings keys to live and preserves the live-owned ones', () => {
  const s = settingsScenario();
  try {
    const result = s.run();

    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(result.settings.applied, true);
    const applied = s.applied();
    assert.deepEqual(applied.hooks, s.declared.hooks, 'the promoted sha owns the hook registrations');
    assert.equal(applied.$schema, s.declared.$schema);
    assert.equal(applied.includeCoAuthoredBy, false, 'a repo-owned key is applied, not merely validated');
    assert.deepEqual(applied.permissions.deny, s.declared.permissions.deny);
    assert.equal(applied.model, s.live.model, 'a live-owned key survives promotion');
    assert.deepEqual(applied.pluginConfigs, s.live.pluginConfigs, 'a live-owned key survives promotion');
  } finally {
    s.dispose();
  }
});

test('promotion withdraws a stale grant from live while the surrounding grants survive', () => {
  const s = settingsScenario();
  try {
    assert.ok(JSON.parse(s.text()).permissions.allow.includes(WITHDRAWN), 'the scratch live file must seed the grant');

    const result = s.run();
    assert.equal(result.status, 'promoted');

    const allow = s.applied().permissions.allow;
    assert.equal(allow.includes(WITHDRAWN), false, `${WITHDRAWN} must not survive a promotion`);
    assert.ok(allow.includes('Bash(node:*)'), 'withdrawal must not take the neighbouring live grants with it');
    assert.ok(allow.includes('Bash(node --test:*)'), 'the declared grants must still be applied');
    assert.ok(
      result.settings.removed.some((entry) => entry.key.includes(WITHDRAWN)),
      `a grant taken out of live must be reported, never silently dropped: ${JSON.stringify(result.settings.removed)}`,
    );
    assert.match(
      settingsNotices(result.settings).join('\n'),
      /^removed permissions\.allow\[Bash\(ln -sfn:\*\)\]: /m,
      'the withdrawal must reach the promote report the operator reads',
    );
  } finally {
    s.dispose();
  }
});

test('a grant the manifest withdraws but live never carried is not reported as removed from live', () => {
  const s = settingsScenario({ live: liveSettings({ permissions: { allow: ['Bash(node:*)'], deny: [] } }) });
  try {
    const result = s.run();

    assert.equal(result.status, 'promoted');
    assert.equal(s.applied().permissions.allow.includes(WITHDRAWN), false);
    assert.deepEqual(
      result.settings.removed.filter((entry) => entry.key.includes(WITHDRAWN)),
      [],
      'a removal notice must describe a real difference from live, not a hypothetical one',
    );
  } finally {
    s.dispose();
  }
});

test('an unrecognized live key survives promotion and is reported as flagged', () => {
  const s = settingsScenario({ live: liveSettings({ sonnetBudgetTokens: 4096 }) });
  try {
    const result = s.run();

    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(s.applied().sonnetBudgetTokens, 4096, 'an unclassified live key is never silently dropped');
    const flagged = result.settings.flagged.find((entry) => entry.key === 'sonnetBudgetTokens');
    assert.equal(flagged?.kind, FLAG_UNCLASSIFIED, JSON.stringify(result.settings.flagged, null, 2));
  } finally {
    s.dispose();
  }
});

test('a reconciled hook registration that does not resolve rejects the candidate and leaves live untouched', () => {
  const s = settingsScenario({ declared: declaredSettings(['$HOME/.claude/hooks/missing.sh']) });
  try {
    const before = s.text();

    const result = s.run();

    assertRejected(result, 'hook-resolution');
    assertLiveUntouched(s.configRoot);
    assert.equal(s.text(), before, 'a rejected candidate must not write the settings it was rejected for');
  } finally {
    s.dispose();
  }
});

test('a promotion whose reconciled settings match the live file byte for byte writes nothing', () => {
  const s = settingsScenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const text = s.text();
    const before = statSync(s.settingsPath, { bigint: true });

    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'more.md'), 'more\n'));
    const again = s.run();

    assert.equal(again.status, 'promoted');
    assert.equal(again.sha, nextSha);
    assert.equal(again.settings.applied, false, 'identical bytes must not be rewritten');
    assert.equal(s.text(), text);
    const after = statSync(s.settingsPath, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
  } finally {
    s.dispose();
  }
});

test('a sha that tracks no settings.json leaves the live settings byte-unchanged', () => {
  const s = settingsScenario({ declared: null });
  try {
    const before = s.text();

    const result = s.run();

    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(result.settings.applied, false);
    assert.equal(s.text(), before, 'an absent declaration leaves live alone rather than clobbering it');
    assert.ok(
      JSON.parse(s.text()).permissions.allow.includes(WITHDRAWN),
      'no declaration means no reconciliation ran at all, withdrawal included',
    );
  } finally {
    s.dispose();
  }
});

const SECOND_HOOK = '$HOME/.claude/hooks/second.sh';

const hookCommands = (document) => document.hooks.SessionStart[0].hooks.map((hook) => hook.command);

const declareSecondHook = (repoRoot) => commitChange(repoRoot, (claude) => {
  writeFile(join(claude, 'hooks', 'second.sh'), GOOD_SH, 0o755);
  writeFile(join(claude, 'settings.json'), render(declaredSettings([SECOND_HOOK])));
});

test('rollback applies the settings the release it rolls back to declares', () => {
  const s = settingsScenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const firstSha = s.sha;
    const firstText = s.text();
    declareSecondHook(s.repoRoot);
    assert.equal(s.run().status, 'promoted');
    assert.deepEqual(hookCommands(s.applied()), [SECOND_HOOK]);

    const rolled = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });

    assert.equal(rolled.status, 'rolled-back', JSON.stringify(rolled.errors ?? rolled.failures ?? [], null, 2));
    assert.equal(liveSha(s.configRoot), firstSha);
    assert.equal(s.text(), firstText, 'live settings must be the document the restored release declares');
    const restored = join(s.configRoot, 'releases', firstSha);
    assert.deepEqual(hookCommands(s.applied()), [...DEFAULT_HOOK_COMMANDS]);
    assert.ok(existsSync(join(restored, 'hooks', 'good.sh')), 'the restored registration resolves inside the restored release');
    assert.ok(!existsSync(join(restored, 'hooks', 'second.sh')), 'the abandoned registration never resolved there');
  } finally {
    s.dispose();
  }
});

test('a rollback whose restored settings do not resolve is refused outright, never half-applied', () => {
  const s = settingsScenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const firstSha = s.sha;
    const nextSha = declareSecondHook(s.repoRoot);
    assert.equal(s.run().status, 'promoted');
    const before = s.text();
    rmSync(join(s.configRoot, 'releases', firstSha, 'hooks', 'good.sh'), { force: true });

    const rolled = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });

    assertRejected(rolled, 'hook-resolution');
    assert.equal(liveSha(s.configRoot), nextSha, 'a refused rollback leaves the pointer where it was');
    assert.equal(s.text(), before, 'a refused rollback writes no settings');
    assert.equal(readReceipt(s.configRoot).receipt.sha, nextSha);
  } finally {
    s.dispose();
  }
});

test('a settings write that fails after the swap fails the promotion and leaves no pointer behind', () => {
  const s = settingsScenario({ settingsDir: 'sealed' });
  try {
    const before = s.text();
    chmodSync(s.holder, 0o555);

    const result = s.run();

    assert.equal(result.status, 'error', JSON.stringify(result, null, 2));
    assert.ok(result.errors.some((error) => error.includes(s.settingsPath)), JSON.stringify(result.errors));
    assert.equal(s.text(), before, 'a promotion that could not apply its settings leaves live settings alone');
    assert.ok(!existsSync(join(s.configRoot, 'current')), 'a failed promotion leaves no pointer at a release it never finished');
    assertLiveUntouched(s.configRoot);
  } finally {
    chmodSync(s.holder, 0o755);
    s.dispose();
  }
});

test('a settings write that fails after the swap returns the pointer to the release the receipt names', () => {
  const s = settingsScenario({ settingsDir: 'sealed' });
  try {
    assert.equal(s.run().status, 'promoted');
    const firstSha = s.sha;
    const firstText = s.text();
    const nextSha = declareSecondHook(s.repoRoot);
    chmodSync(s.holder, 0o555);

    const result = s.run();

    assert.equal(result.status, 'error', JSON.stringify(result, null, 2));
    assert.equal(result.sha, nextSha);
    assert.equal(liveSha(s.configRoot), firstSha, 'the pointer returns to the release the receipt still names');
    assert.equal(readReceipt(s.configRoot).receipt.sha, firstSha);
    assert.equal(s.text(), firstText);
    assert.ok(!existsSync(join(s.configRoot, 'current.tmp')));
  } finally {
    chmodSync(s.holder, 0o755);
    s.dispose();
  }
});

test('a receipt write that fails after the swap undoes both the pointer and the settings it applied', () => {
  const s = settingsScenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const firstSha = s.sha;
    const firstText = s.text();
    const nextSha = declareSecondHook(s.repoRoot);
    rmSync(join(s.configRoot, 'LIVE'), { force: true });
    writeFile(join(s.configRoot, 'LIVE', 'occupied.txt'), 'in the way\n');

    const result = s.run();

    assert.equal(result.status, 'error', JSON.stringify(result, null, 2));
    assert.equal(result.sha, nextSha);
    assert.ok(result.errors.some((error) => /receipt/.test(error)), JSON.stringify(result.errors));
    assert.equal(liveSha(s.configRoot), firstSha, 'the pointer never rests on a release the receipt does not name');
    assert.equal(s.text(), firstText, 'the settings applied for the abandoned release are undone with it');
    assert.ok(!existsSync(join(s.configRoot, 'LIVE.tmp')), 'a failed receipt write leaves no staging file');
  } finally {
    s.dispose();
  }
});

test('a first promote builds the release, swaps the pointer and writes a complete LIVE receipt', () => {
  const s = scenario();
  try {
    const result = s.run();
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
    assert.equal(result.sha, s.sha);
    assert.equal(result.previous, null);

    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', s.sha));
    assert.equal(liveSha(s.configRoot), s.sha);

    const stored = readReceipt(s.configRoot);
    assert.ok(stored.ok, JSON.stringify(stored.errors ?? []));
    assert.deepEqual(Object.keys(stored.receipt), [...RECEIPT_FIELDS]);
    assert.equal(stored.receipt.ref, 'main');
    assert.equal(stored.receipt.sha, s.sha);
    assert.equal(stored.receipt.previous, null);
    assert.equal(stored.receipt.promoted_at, NOW);
    assert.equal(stored.receipt.repo_root, s.repoRoot);
    assert.ok(stored.receipt.built_at);
  } finally {
    s.dispose();
  }
});

test('re-promoting the already-live sha does nothing: no swap, no receipt rewrite', () => {
  const s = scenario();
  try {
    assert.equal(s.run().status, 'promoted');
    const pointerBefore = statSync(join(s.configRoot, 'current'), { bigint: true });
    const receiptBefore = readFileSync(join(s.configRoot, 'LIVE'), 'utf8');

    const again = s.run({ now: '2026-09-09T09:09:09.000Z' });

    assert.equal(again.status, 'unchanged');
    assert.equal(again.sha, s.sha);
    assert.equal(readFileSync(join(s.configRoot, 'LIVE'), 'utf8'), receiptBefore);
    const pointerAfter = statSync(join(s.configRoot, 'current'), { bigint: true });
    assert.equal(pointerAfter.ino, pointerBefore.ino);
    assert.equal(pointerAfter.ctimeNs, pointerBefore.ctimeNs);
  } finally {
    s.dispose();
  }
});

test('the swap replaces the pointer in place and never writes into the outgoing release', () => {
  const s = scenario();
  try {
    s.run();
    const outgoing = join(s.configRoot, 'releases', s.sha);
    const before = readdirSync(outgoing).sort();

    const nextSha = commitChange(s.repoRoot, (claude) => {
      writeFile(join(claude, 'docs', 'added.md'), 'more\n');
    });
    const result = s.run();

    assert.equal(result.status, 'promoted');
    assert.equal(result.sha, nextSha);
    assert.equal(result.previous, s.sha);
    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', nextSha));
    assert.deepEqual(readdirSync(outgoing).sort(), before);
    assert.ok(!existsSync(join(s.configRoot, 'current.tmp')));
  } finally {
    s.dispose();
  }
});

test('swapPointer leaves no window without a pointer and overwrites a stale staging link', () => {
  const s = scenario();
  try {
    s.run();
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'b.md'), 'b\n'));
    mkdirSync(join(s.configRoot, 'releases', nextSha), { recursive: true });
    swapPointer(s.configRoot, s.sha);

    swapPointer(s.configRoot, nextSha);

    assert.equal(readlinkSync(join(s.configRoot, 'current')), join('releases', nextSha));
    assert.ok(!existsSync(join(s.configRoot, 'current.tmp')));
  } finally {
    s.dispose();
  }
});

test('the pointer never comes to rest on a release carrying settings.json, rollback included', () => {
  const s = scenario();
  try {
    s.run();
    const firstSha = s.sha;
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'd.md'), 'd\n'));
    assert.equal(s.run().status, 'promoted');

    const stale = join(s.configRoot, 'releases', firstSha, 'settings.json');
    writeFile(stale, '{\n  "hooks": {}\n}\n');

    const rolled = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });

    assert.equal(rolled.status, 'rolled-back');
    assert.equal(liveSha(s.configRoot), firstSha);
    assert.equal(rolled.previous, nextSha);
    assert.ok(!existsSync(stale), 'current must never resolve to a release that shadows the live settings.json');
  } finally {
    s.dispose();
  }
});

test('rollback is never blocked by a release whose settings.json cannot be stripped', () => {
  const s = scenario();
  const sealed = join(s.configRoot, 'releases', s.sha);
  try {
    s.run();
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'e.md'), 'e\n'));
    assert.equal(s.run().status, 'promoted');

    writeFile(join(sealed, 'settings.json'), '{\n  "hooks": {}\n}\n');
    chmodSync(sealed, 0o555);

    const rolled = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });

    assert.equal(rolled.status, 'rolled-back', JSON.stringify(rolled.errors ?? [], null, 2));
    assert.equal(liveSha(s.configRoot), s.sha);
    assert.equal(rolled.previous, nextSha);
    assert.equal(rolled.warnings.length, 1, JSON.stringify(rolled.warnings ?? []));
    assert.match(rolled.warnings[0], /settings\.json/);
    assert.match(rolled.warnings[0], /shadow the live settings\.json/);
  } finally {
    chmodSync(sealed, 0o755);
    s.dispose();
  }
});

test('promotion still refuses to rest the pointer on a release it could not strip', () => {
  const s = scenario();
  const sealed = join(s.configRoot, 'releases', s.sha);
  try {
    s.run();
    writeFile(join(sealed, 'settings.json'), '{\n  "hooks": {}\n}\n');
    chmodSync(sealed, 0o555);

    assert.throws(() => swapPointer(s.configRoot, s.sha), /settings\.json|could not be removed/);
  } finally {
    chmodSync(sealed, 0o755);
    s.dispose();
  }
});

test('rollback swaps to LIVE.previous without rebuilding, and fails loudly if that release is gone', () => {
  const s = scenario();
  try {
    s.run();
    const firstSha = s.sha;
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'c.md'), 'c\n'));
    assert.equal(s.run().status, 'promoted');
    assert.equal(liveSha(s.configRoot), nextSha);

    const firstDir = join(s.configRoot, 'releases', firstSha);
    const inodeBefore = statSync(firstDir, { bigint: true }).ino;

    const rolled = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });

    assert.equal(rolled.status, 'rolled-back');
    assert.equal(rolled.sha, firstSha);
    assert.equal(rolled.previous, nextSha);
    assert.equal(liveSha(s.configRoot), firstSha);
    assert.equal(statSync(firstDir, { bigint: true }).ino, inodeBefore);
    assert.equal(readReceipt(s.configRoot).receipt.previous, nextSha);

    rmSync(join(s.configRoot, 'releases', nextSha), { recursive: true, force: true });
    const impossible = rollback({ configRoot: s.configRoot, now: NOW, home: s.home });
    assert.equal(impossible.status, 'error');
    assert.match(impossible.errors[0], /never rebuilds/);
    assert.equal(liveSha(s.configRoot), firstSha);
  } finally {
    s.dispose();
  }
});

test('an unusable timestamp is refused before the pointer moves, never stranding live without a receipt', () => {
  const s = scenario();
  try {
    const result = s.run({ now: undefined });

    assert.equal(result.status, 'error');
    assert.ok(
      result.errors.some((error) => error.includes('promoted_at')),
      JSON.stringify(result.errors),
    );
    assert.equal(liveSha(s.configRoot), null);
    assert.ok(!existsSync(join(s.configRoot, 'current')), 'a receipt that cannot be written must not move the pointer');
    assert.ok(!existsSync(join(s.configRoot, 'LIVE')));
  } finally {
    s.dispose();
  }
});

test('garbage collection retains five releases and spares current and its predecessor', () => {
  const { home, configRoot } = makeHome();
  try {
    const releases = join(configRoot, 'releases');
    const shas = Array.from({ length: 8 }, (_, index) => `${index}`.repeat(40));
    shas.forEach((sha, index) => {
      mkdirSync(join(releases, sha), { recursive: true });
      const stamp = 1_000_000 + index * 60;
      utimesSync(join(releases, sha), stamp, stamp);
    });
    const current = shas[0];
    const previous = shas[1];
    const newestFive = shas.slice(3).reverse();

    const { removed } = collectGarbage({ configRoot, keep: 5, protectedShas: [current, previous] });

    assert.deepEqual(removed, [shas[2]]);
    const survivors = listReleases(configRoot).map((entry) => entry.sha).sort();
    assert.deepEqual(survivors, [current, previous, ...newestFive].sort());
    assert.ok(!survivors.includes(shas[2]));
  } finally {
    cleanup(home);
  }
});
