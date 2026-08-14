import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_KINDS } from '../prompt-contract.mjs';
import { PENDING_JUDGMENT_KINDS } from '../transcription-census.mjs';
import { JOURNAL_KINDS } from '../journal-store.mjs';
import {
  CONVERSION_SITE_NAMES,
  JOURNAL_LABEL_KINDS,
  NON_DISPATCH_LABEL_SOURCES,
  PREFIX_ALIASES,
  PROGRAM_LABELS,
  TRANSCRIPTION_C7_OBLIGATIONS,
  TRANSCRIPTION_KINDS,
  censusTranscriptionSources,
  conversionSitesOf,
  transcriptionCensus,
} from '../transcription-census.mjs';
import { CONVERTED_TRANSCRIPTION_SITES } from '../transcription-conversions.mjs';

const TARGET = '/repo/.claude/workflows/mitosis.js';
const CLAUDE = '/repo/.claude';

function source(path, text) {
  return { path, source: text };
}

function dispatch(labelExpression) {
  return `await agent(prompt, { agentType: 'implementer', label: ${labelExpression}, phase: 'Ship' });`;
}

const PARAMETERIZED_BLOCK = [
  'async function reviewLoop(task, branch, wt, makePrompt, label, agentType) {',
  '  const base = { label: `${label}:${task.id}`, phase: \'Execute\' };',
  '  const opts = agentType ? { ...base, agentType } : base;',
  '  const r = await guard.dispatch(makePrompt(task, branch), opts, { kind: \'review\', task });',
  '  await guard.dispatch(fixPrompt(task, branch, wt, r), { label: `fix-${label}:${task.id}`, phase: \'Execute\' });',
  '  await guard.dispatch(implementerPrompt(task), { label: implLabel, phase: \'Execute\' });',
  '}',
  'async function appendRunJournal({ label, unitId }) {',
  '  await agent(prompt, { agentType: \'implementer\', label: `${label}:${unitId}`, phase: \'Ship\' });',
  '}',
  'async function persistQuiescentExitCheckpoint() {',
  '  await appendRunJournal({ label: \'quiescent-exit-checkpoint\', unitId: \'run\' });',
  '}',
  'function makeModelGuard(agent, decision, opts, prompt) {',
  '  return agent(prompt, { ...(opts || {}), model: decision.model });',
  '}',
].join('\n');

function engineFixture(extra = '', declared = TRANSCRIPTION_KINDS) {
  const lines = [
    ...declared.map((kind) => dispatch(`'${kind.name}'`)),
    ...Object.keys(JOURNAL_LABEL_KINDS).filter((name) => name !== 'quiescent-exit-checkpoint').map((name) => dispatch(`'${name}'`)),
    ...PROGRAM_LABELS.map((program) => dispatch(`'${program.name}'`)),
    ...PROMPT_KINDS.filter((kind) => !PENDING_JUDGMENT_KINDS.some((pending) => pending.name === kind)).map((kind) => dispatch(`'${kind}'`)),
    PARAMETERIZED_BLOCK,
    extra,
  ];
  return [
    source(TARGET, lines.join('\n')),
    ...Object.keys(NON_DISPATCH_LABEL_SOURCES).map((key) => source(`${CLAUDE}/${key}`, `const x = { label: 'not a dispatch' };`)),
  ];
}

test('the fixture that stands in for the engine is itself a clean census, so every perturbation below is the only change', () => {
  const census = censusTranscriptionSources(engineFixture());
  assert.equal(census.ok, true, census.error);
});

test('the shipped census classifies every dispatch and reports the conversion target site count as a measurement', () => {
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
  assert.equal(census.conversionTargetSiteCount, 18);
  assert.equal(census.convertedSiteCount + census.unconvertedSiteCount, census.conversionTargetSiteCount);
  assert.equal(census.unconvertedSiteCount, census.unconvertedSites.length);
  assert.equal(census.convertedKindCount + census.unconvertedKindCount, TRANSCRIPTION_KINDS.length);
  assert.deepEqual(census.unconvertedSites.map((site) => site.name).sort(), []);
  assert.equal(census.convertedSiteCount, census.conversionTargetSiteCount);
});

test('the converted count is measured from the declaration, never pinned to a total', () => {
  const declared = TRANSCRIPTION_KINDS.map((kind) => (kind.name === 'fence' ? { ...kind, converted: false } : kind));
  const census = censusTranscriptionSources(engineFixture(), declared);
  assert.equal(census.ok, false, 'a declaration that disagrees with the registered replacements was accepted');
  assert.match(census.error, /fence is served by fence/);
});

test('a replacement registered for a site whose kind is declared unconverted halts rather than being filtered away', () => {
  assert.ok(CONVERTED_TRANSCRIPTION_SITES.includes('ship-verify'), 'ship-verify registers no replacement, so this perturbation proves nothing');
  const declared = TRANSCRIPTION_KINDS.map((kind) => (kind.name === 'ship-verify' ? { ...kind, converted: false } : kind));
  const census = censusTranscriptionSources(engineFixture(), declared);
  assert.equal(census.ok, false);
  assert.match(census.error, /is served by ship-verify/);
});

test('a replacement registered under a name no declared kind reaches halts rather than being filtered away', () => {
  assert.ok(!CONVERTED_TRANSCRIPTION_SITES.includes('fence-extra'), 'fence-extra already registers a replacement, so this perturbation proves nothing');
  const census = censusTranscriptionSources(engineFixture(), TRANSCRIPTION_KINDS, [...CONVERTED_TRANSCRIPTION_SITES, 'fence-extra']);
  assert.equal(census.ok, false);
  assert.match(census.error, /serve no declared kind/);
});

test('the census measures its own extractors rather than reporting a declared total', () => {
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
  assert.equal(census.dispatchNodeCount, census.siteCount + census.passThroughCount);
  assert.equal(census.dispatchLabelCount, census.siteCount);
  assert.ok(census.sourceCount > 1);
  assert.equal(census.transcriptionSiteCount, census.conversionTargetSiteCount + census.twinSites.length);
});

test('the census names the live twins that dispatch outside the conversion target', () => {
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
  const named = census.twinSites.map((site) => `${site.name} ${site.path.split('/').slice(-2).join('/')}`);
  assert.ok(named.includes('fence mitosis/run-engine.mjs'), named.join('; '));
  assert.ok(named.includes('integrate mitosis/run-engine.mjs'), named.join('; '));
  assert.ok(named.includes('divergence-check mitosis/divergence.mjs'), named.join('; '));
  for (const site of census.twinSites) assert.ok(Number.isInteger(site.line) && site.line > 0);
});

test('the C7 obligations name every twin the census measures, so the divergence is recorded rather than assumed', () => {
  const census = transcriptionCensus();
  const joined = TRANSCRIPTION_C7_OBLIGATIONS.join('\n');
  assert.ok(TRANSCRIPTION_C7_OBLIGATIONS.length > 0);
  assert.ok(census.twinSites.length > 0);
  for (const site of census.twinSites) {
    assert.ok(joined.includes(site.path.split('/').pop()), `${site.path} is measured as a twin but named in no C7 obligation`);
  }
});

test('a label no declared name covers halts and names the site, with no catch-all bucket', () => {
  const census = censusTranscriptionSources(engineFixture(dispatch("'harvest-notes'")));
  assert.equal(census.ok, false);
  assert.match(census.error, /harvest-notes/);
  assert.match(census.error, /mitosis\.js/);
});

test('a label that merely EXTENDS a declared name with a hyphen halts rather than being absorbed by it', () => {
  const absorbers = [
    ['plan-publish', 'plan'],
    ['implement-manifest', 'implement'],
    ['fix-refs', 'fix'],
    ['ship-manifest', 'ship'],
    ['boundary-sweep', 'boundary'],
    ['reconcile-again', 'reconcile'],
  ];
  for (const [spelling, absorbedBy] of absorbers) {
    const census = censusTranscriptionSources(engineFixture(dispatch(`'${spelling}'`)));
    assert.equal(census.ok, false, `${spelling} was silently booked against ${absorbedBy} instead of halting`);
    assert.match(census.error, new RegExp(spelling));
  }
});

test('an extending label is not merely misfiled: the site count it would have joined never moves', () => {
  const clean = censusTranscriptionSources(engineFixture());
  assert.equal(clean.ok, true, clean.error);
  const absorbed = censusTranscriptionSources(engineFixture(dispatch("'plan-publish'")));
  assert.equal(absorbed.ok, false);
  assert.match(absorbed.error, /catch-all|no declared/i);
});

test('the one declared prefix alias resolves its own spelling and nothing wider', () => {
  assert.deepEqual(PREFIX_ALIASES.map((entry) => entry.prefix), ['fix-']);
  for (const alias of PREFIX_ALIASES) {
    assert.ok(typeof alias.reason === 'string' && alias.reason.trim().length > 0);
    assert.ok(PROMPT_KINDS.includes(alias.name) || TRANSCRIPTION_KINDS.some((kind) => kind.name === alias.name));
  }
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
});

test('a declared prefix alias that matches nothing halts, so a stale alias cannot keep a spelling admitted', () => {
  const withoutFix = engineFixture().map((entry) => (entry.path === TARGET
    ? source(entry.path, entry.source.replace('label: `fix-${label}:${task.id}`', 'label: `fix:${task.id}`'))
    : entry));
  const census = censusTranscriptionSources(withoutFix);
  assert.equal(census.ok, false);
  assert.match(census.error, /fix-/);
});

test('a source whose two extractors disagree halts, because one of them is then reading a subset', () => {
  const census = censusTranscriptionSources(engineFixture("const stray = { label: 'fence' };"));
  assert.equal(census.ok, false);
  assert.match(census.error, /disagree|subset/i);
});

test('a declared kind that dispatches nowhere halts whether it is counted converted or not', () => {
  for (const converted of [true, false]) {
    const declared = [...TRANSCRIPTION_KINDS, { name: 'reharvest', converted }];
    const census = censusTranscriptionSources(engineFixture('', TRANSCRIPTION_KINDS), declared);
    assert.equal(census.ok, false, `a kind declared converted=${converted} with no dispatch was accepted, so a site removed before its wiring landed would read as progress`);
    assert.match(census.error, /reharvest/);
  }
});

test('a kind counted converted with no registered replacement halts, so the count cannot run ahead of the code', () => {
  assert.ok(CONVERTED_TRANSCRIPTION_SITES.includes('reconcile'), 'reconcile registers no replacement, so this perturbation withdraws nothing');
  const withdrawn = CONVERTED_TRANSCRIPTION_SITES.filter((site) => site !== 'reconcile');
  const census = censusTranscriptionSources(engineFixture('', TRANSCRIPTION_KINDS), TRANSCRIPTION_KINDS, withdrawn);
  assert.equal(census.ok, false);
  assert.match(census.error, /reconcile needs reconcile/);
});

test('a kind whose replacement is registered but counted unconverted halts, so a conversion cannot go uncounted', () => {
  const declared = TRANSCRIPTION_KINDS.map((kind) => (kind.name === 'checkpoint-push' ? { ...kind, converted: false } : kind));
  const census = censusTranscriptionSources(engineFixture('', TRANSCRIPTION_KINDS), declared);
  assert.equal(census.ok, false);
  assert.match(census.error, /checkpoint-push is served by checkpoint-push/);
});

test('the one kind whose name covers two sites is counted converted only when both replacements are registered', () => {
  assert.deepEqual(conversionSitesOf('branch'), ['branch-compose', 'branch-prep']);
  assert.deepEqual(conversionSitesOf('fence'), ['fence']);
  for (const site of conversionSitesOf('branch')) {
    assert.ok(CONVERTED_TRANSCRIPTION_SITES.includes(site), `${site} is not registered, so branch cannot be counted converted`);
  }
  const branch = TRANSCRIPTION_KINDS.find((kind) => kind.name === 'branch');
  assert.equal(branch.converted, true);
});

test('every alias in the conversion site table names a kind that is still declared', () => {
  for (const name of Object.keys(CONVERSION_SITE_NAMES)) {
    assert.ok(TRANSCRIPTION_KINDS.some((kind) => kind.name === name), `${name} is given a conversion site list but is declared nowhere`);
  }
});

test('a dispatch node carrying no label halts unless its shape is enumerated with a reason', () => {
  const census = censusTranscriptionSources(engineFixture('await agent(prompt, { phase: 20 });'));
  assert.equal(census.ok, false);
  assert.match(census.error, /carries no label/i);
});

test('a parameterized label the census cannot resolve halts rather than being skipped', () => {
  const census = censusTranscriptionSources(engineFixture(dispatch('chosenLabel')));
  assert.equal(census.ok, false);
  assert.match(census.error, /chosenLabel/);
});

test('a source declared free of dispatch labels halts once it acquires a dispatch', () => {
  const sources = engineFixture();
  const infected = sources.map((entry) => (entry.path.endsWith('gh-merge-shim.mjs')
    ? source(entry.path, `${entry.source}\n${dispatch("'fence'")}`)
    : entry));
  const census = censusTranscriptionSources(infected);
  assert.equal(census.ok, false);
  assert.match(census.error, /gh-merge-shim/);
});

test('a source declared free of dispatch labels halts once it stops carrying any label at all', () => {
  const sources = engineFixture();
  const emptied = sources.map((entry) => (entry.path.endsWith('gh-merge-shim.mjs')
    ? source(entry.path, 'export const x = 1;')
    : entry));
  const census = censusTranscriptionSources(emptied);
  assert.equal(census.ok, false);
  assert.match(census.error, /gh-merge-shim/);
});

test('an enumerated labelless dispatch shape that vanishes halts, so a stale enumeration cannot sit unread', () => {
  const sources = engineFixture().map((entry) => (entry.path === TARGET
    ? source(entry.path, entry.source.replace('return agent(prompt, { ...(opts || {}), model: decision.model });', 'return null;'))
    : entry));
  const census = censusTranscriptionSources(sources);
  assert.equal(census.ok, false);
  assert.match(census.error, /decision\.model|enumerat/i);
});

test('the journal label map resolves exactly the kinds the journal store declares, in both directions', () => {
  assert.deepEqual([...new Set(Object.values(JOURNAL_LABEL_KINDS))].sort(), [...JOURNAL_KINDS].sort());
});

test('every judgment kind the prompt authority declares is reachable from some measured dispatch label', () => {
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
  const reached = new Set(census.judgmentKindsReached);
  const pending = new Set(PENDING_JUDGMENT_KINDS.map((entry) => entry.name));
  for (const kind of PROMPT_KINDS) {
    if (pending.has(kind)) {
      assert.ok(!reached.has(kind), `${kind} is declared as awaiting a dispatch yet one already reaches it, so the declaration excuses a kind the census can see`);
      continue;
    }
    assert.ok(reached.has(kind), `${kind} is declared but no dispatch label resolves to it`);
  }
});

test('every declared program-in-English label has a measured site', () => {
  const census = transcriptionCensus();
  const reached = new Set(census.programKindsReached);
  for (const program of PROGRAM_LABELS) assert.ok(reached.has(program.name), `${program.name} has no site`);
});

test('the declared name sets are disjoint, so no label resolves to two categories', () => {
  const census = transcriptionCensus();
  assert.equal(census.ok, true, census.error);
  assert.equal(new Set(census.declaredNames).size, census.declaredNames.length);
});

test('a census handed no source halts rather than attesting a scope it never read', () => {
  const census = censusTranscriptionSources([]);
  assert.equal(census.ok, false);
  assert.match(census.error, /no source/i);
});

test('every enumerated inert source and helper carries a recorded reason', () => {
  for (const [name, reason] of Object.entries(NON_DISPATCH_LABEL_SOURCES)) {
    assert.ok(typeof reason === 'string' && reason.trim().length > 0, `${name} is withheld without a reason`);
  }
  for (const program of PROGRAM_LABELS) {
    assert.ok(typeof program.reason === 'string' && program.reason.trim().length > 0, `${program.name} is declared without a reason`);
  }
});

test('the remaining-invocation count tracks the dispatches the census saw, never the conversion declaration', () => {
  const declared = TRANSCRIPTION_KINDS.map((kind) => (kind.name === 'fence' ? { ...kind, converted: false } : kind));
  const withdrawn = CONVERTED_TRANSCRIPTION_SITES.filter((site) => site !== 'fence');
  const baseline = censusTranscriptionSources(engineFixture());
  const flipped = censusTranscriptionSources(engineFixture(), declared, withdrawn);
  assert.equal(baseline.ok, true, baseline.error);
  assert.equal(flipped.ok, true, flipped.error);
  assert.notEqual(flipped.convertedSiteCount, baseline.convertedSiteCount, 'flipping a kind changed no converted count, so this control distinguishes nothing');
  assert.equal(
    flipped.conversionTargetSiteCount,
    baseline.conversionTargetSiteCount,
    'the target-site count moved when a conversion declaration changed, so a receipt derived from it would report the declaration rather than the dispatches that remain',
  );
});
