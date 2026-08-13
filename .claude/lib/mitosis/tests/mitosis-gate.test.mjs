import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GATE_CLEAN_EXIT,
  GATE_USAGE_EXIT,
  GATE_VIOLATION_EXIT,
  GATE_UNRESOLVABLE_EXIT,
  GATE_READ_EXIT,
  GATE_COMPILE_EXIT,
  MITOSIS_GATE_VERBS,
  DEFAULT_PHASE_PARITY_TARGET,
  checkPhaseParity,
  compileUnderSandbox,
  extractDeclaredPhases,
  extractCalledPhases,
  extractAssignedPhases,
  extractPhaseSurfaces,
  parseMitosisGateArgv,
  runMitosisGate,
} from '../mitosis-gate.mjs';
import { scanJsStructure } from '../js-scan.mjs';
import {
  MITOSIS_GIT_USAGE_EXIT,
  MITOSIS_GIT_TRIPWIRE_EXIT,
  MITOSIS_GIT_OBSERVE_EXIT,
  MITOSIS_GIT_CONVERGE_EXIT,
  MITOSIS_GIT_GH_MISSING_EXIT,
} from '../../git/pr.mjs';

const PHASE_TOKEN = /(?<![\w$.])phase(?![\w$])/g;

const BALANCED = Object.freeze({
  declared: Object.freeze(['Plan', 'Ship']),
  called: Object.freeze(['Plan', 'Ship']),
  assigned: Object.freeze(['Plan', 'Ship', 'Ship']),
});

const FORWARDING_SOURCE = `
export const meta = {
  phases: [
    { title: 'Plan' },
    { title: 'Ship' },
  ],
};

function makeRemediation({ unitId, phase: phaseName, model }) {
  return {
    redispatch: () => agent(prompt, { label: \`redispatch:\${unitId}\`, phase: phaseName, model }),
  };
}

export function run() {
  phase('Plan');
  agent(planPrompt, { label: 'plan', phase: 'Plan' });
  phase('Ship');
  agent(shipPrompt, { label: 'ship', phase: 'Ship' });
  return makeRemediation({ unitId: 'x', phase: 'Ship', model: 'sonnet' });
}
`;

function withCallSite(callSiteArgs) {
  return `
export const meta = { phases: [{ title: 'Plan' }] };

function makeRemediation({ phase: phaseName }) {
  return { redispatch: () => agent(prompt, { phase: phaseName }) };
}

export function run() {
  phase('Plan');
  agent(prompt, { phase: 'Plan' });
  return makeRemediation(${callSiteArgs});
}
`;
}

function withBody(body, declared = "{ title: 'Plan' }", preamble = '') {
  return `${preamble}
export const meta = { phases: [${declared}] };
export function run() {
  phase('Plan');
  agent(prompt, { label: 'a', phase: 'Plan' });
${body}
}
`;
}

function liveSource() {
  return readFileSync(DEFAULT_PHASE_PARITY_TARGET, 'utf8');
}

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    out: Object.freeze({ log: (text) => stdout.push(text), err: (text) => stderr.push(text) }),
  };
}

test('the pure checker flags a phase that is declared but never used', () => {
  const verdict = checkPhaseParity({ ...BALANCED, declared: [...BALANCED.declared, 'Final review'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverUsed, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, []);
});

test('the pure checker flags a phase that is used but never declared', () => {
  const verdict = checkPhaseParity({ ...BALANCED, called: [...BALANCED.called, 'Shepherd'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
  assert.deepEqual(verdict.declaredNeverUsed, []);
});

test('the pure checker flags an assigned phase that is never declared', () => {
  const verdict = checkPhaseParity({ ...BALANCED, assigned: [...BALANCED.assigned, 'Shepherd'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
});

test('the pure checker reports both directions at once', () => {
  const verdict = checkPhaseParity({ declared: ['Plan', 'Final review'], called: ['Plan'], assigned: ['Shepherd'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverUsed, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
});

test('the pure checker returns clean when the three surfaces agree', () => {
  const verdict = checkPhaseParity(BALANCED);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.declaredNeverUsed, []);
  assert.deepEqual(verdict.usedNeverDeclared, []);
  assert.deepEqual(verdict.declared, ['Plan', 'Ship']);
});

test('the pure checker treats a phase used only through assignment as used', () => {
  const verdict = checkPhaseParity({ declared: ['Plan', 'Remediate'], called: ['Plan'], assigned: ['Remediate'] });
  assert.equal(verdict.ok, true);
});

test('the pure checker leaves its inputs unmutated and freezes its verdict', () => {
  const declared = ['Plan', 'Ship'];
  const called = ['Ship', 'Plan'];
  const assigned = ['Plan', 'Ship'];
  const verdict = checkPhaseParity({ declared, called, assigned });
  assert.deepEqual(declared, ['Plan', 'Ship']);
  assert.deepEqual(called, ['Ship', 'Plan']);
  assert.deepEqual(assigned, ['Plan', 'Ship']);
  assert.equal(Object.isFrozen(verdict), true);
});

test('the pure checker rejects a surface that is not an array of non-empty strings', () => {
  assert.throws(() => checkPhaseParity({ ...BALANCED, declared: 'Plan' }), TypeError);
  assert.throws(() => checkPhaseParity({ ...BALANCED, called: [] }), TypeError);
  assert.throws(() => checkPhaseParity({ ...BALANCED, assigned: ['Plan', '  '] }), TypeError);
  assert.throws(() => checkPhaseParity(null), TypeError);
});

test('the extractors read declared, called and assigned phases out of source text', () => {
  const declared = extractDeclaredPhases(FORWARDING_SOURCE);
  const called = extractCalledPhases(FORWARDING_SOURCE);
  const assigned = extractAssignedPhases(FORWARDING_SOURCE);
  assert.equal(declared.ok, true);
  assert.deepEqual([...declared.phases], ['Plan', 'Ship']);
  assert.equal(called.ok, true);
  assert.deepEqual([...called.phases], ['Plan', 'Ship']);
  assert.equal(assigned.ok, true);
  assert.deepEqual([...assigned.phases].sort(), ['Plan', 'Ship', 'Ship', 'Ship']);
});

test('the assignment extractor excludes a destructuring rename and resolves the value it forwards', () => {
  const assigned = extractAssignedPhases(FORWARDING_SOURCE);
  assert.equal(assigned.ok, true);
  assert.deepEqual({ ...assigned.counts }, {
    tokens: 7, keys: 5, calls: 2, bare: 0, literal: 3, dead: 0, destructuring: 1, forwarded: 1,
  });
});

test('the assignment extractor ignores a phase key that only appears inside a string or template', () => {
  const source = withBody("  const note = \"an object shaped { phase: 'Shepherd' }\";\n  const other = `the option is phase: 'Shepherd' verbatim`;");
  const assigned = extractAssignedPhases(source);
  assert.equal(assigned.ok, true);
  assert.deepEqual([...assigned.phases], ['Plan']);
  assert.equal(assigned.counts.keys, 1);
});

test('every phase token in the live mitosis workflow lands in a classified bucket', () => {
  const source = liveSource();
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, scan.error);
  const independentTokenCount = (scan.masked.match(PHASE_TOKEN) || []).length;
  const extracted = extractPhaseSurfaces(source);
  assert.equal(extracted.ok, true, extracted.error);
  const { tokens, keys, calls, bare } = extracted.counts;
  assert.equal(
    keys + calls + bare,
    independentTokenCount,
    'every phase token counted independently over the masked source is bucketed as a key, a call or a bare identifier',
  );
  assert.equal(tokens, independentTokenCount);
  assert.ok(keys > 0 && calls > 0, 'the live workflow carries both a key surface and a call surface');
});

test('the live mitosis workflow carries no phase title reachable only from dead code', () => {
  const extracted = extractPhaseSurfaces(liveSource());
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 0);
});

test('the gate returns clean against the live mitosis workflow', () => {
  const extracted = extractPhaseSurfaces(liveSource());
  assert.equal(extracted.ok, true, extracted.error);
  const verdict = checkPhaseParity(extracted.surfaces);
  assert.deepEqual(verdict.declaredNeverUsed, [], 'the live workflow declares no unused phase');
  assert.deepEqual(verdict.usedNeverDeclared, [], 'the live workflow uses no undeclared phase');
  assert.equal(verdict.ok, true);
});

test('the census halts on a quoted phase key rather than missing it', () => {
  const extracted = extractPhaseSurfaces(withBody("  agent(p, { label: 'b', 'phase': 'Shepherd' });"));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /quoted phase key at line \d+/);
});

test('the census halts on a computed phase key rather than missing it', () => {
  const extracted = extractPhaseSurfaces(withBody("  agent(p, { label: 'b', ['phase']: 'Shepherd' });"));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /computed phase key at line \d+/);
});

test('the census halts on a member-call phase invocation rather than missing it', () => {
  const extracted = extractPhaseSurfaces(withBody("  ctx.phase('Shepherd');"));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /member-call phase invocation at line \d+/);
});

test('the census halts when a phase token is bound to a value instead of used as a surface', () => {
  const extracted = extractPhaseSurfaces(withBody("  const phase = 'Shepherd';\n  agent(p, { label: 'b', phase });"));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /fits no known phase surface/);
});

test('the census halts on a phase token in ternary position rather than reading it as a key', () => {
  const extracted = extractPhaseSurfaces(withBody(
    "  const chosen = flag ? phase : 'Final review';",
    "{ title: 'Plan' }, { title: 'Final review' }",
  ));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /fits no known phase surface/);
});

test('the census classifies object shorthand forwarding the phase callback as a bare identifier', () => {
  const extracted = extractPhaseSurfaces(withBody('  runEngine(a, { agent, log, phase });'));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.bare, 1);
  assert.equal(checkPhaseParity(extracted.surfaces).ok, true);
});

test('a phase literal reachable only from an unreferenced binding does not mark the title used', () => {
  const extracted = extractPhaseSurfaces(withBody(
    '',
    "{ title: 'Plan' }, { title: 'Final review' }",
    "export const NEVER_USED = { phase: 'Final review' };",
  ));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 1);
  const verdict = checkPhaseParity(extracted.surfaces);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverUsed, ['Final review']);
});

test('a phase literal in a referenced binding still marks the title used', () => {
  const extracted = extractPhaseSurfaces(withBody(
    "  const base = { label: 'b', phase: 'Ship' };\n  agent(p, { ...base });",
    "{ title: 'Plan' }, { title: 'Ship' }",
  ));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 0);
  assert.equal(checkPhaseParity(extracted.surfaces).ok, true);
});

test('a phase literal in a returned object still marks the title used', () => {
  const extracted = extractPhaseSurfaces(withBody(
    "  return { label: 'b', phase: 'Ship' };",
    "{ title: 'Plan' }, { title: 'Ship' }",
  ));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 0);
  assert.equal(checkPhaseParity(extracted.surfaces).ok, true);
});

test('the declaration extractor halts when the target carries more than one phases array', () => {
  const extracted = extractPhaseSurfaces(withBody(
    '',
    "{ title: 'Plan' }, { title: 'Final review' }",
    "const doc = { phases: [{ title: 'Alpha' }, { title: 'Beta' }] };",
  ));
  assert.equal(extracted.ok, false);
  assert.match(extracted.error, /carries 2 phases arrays/);
});

test('the declaration extractor halts when the only phases array sits outside meta', () => {
  const source = `
const doc = { phases: [{ title: 'Alpha' }] };
export const meta = { name: 'x' };
export function run() { phase('Plan'); agent(p, { phase: 'Plan' }); }
`;
  const declared = extractDeclaredPhases(source);
  assert.equal(declared.ok, false);
  assert.match(declared.error, /sits outside the meta object/);
});

test('the declaration extractor ignores a nested title that is not a direct phases element', () => {
  const declared = extractDeclaredPhases(withBody('', "{ title: 'Plan', extra: { title: 'Ghost' } }"));
  assert.equal(declared.ok, true, declared.error);
  assert.deepEqual([...declared.phases], ['Plan']);
});

test('the assignment extractor halts fail-closed when a forwarding call site passes a non-literal', () => {
  const assigned = extractAssignedPhases(withCallSite('{ phase: chosenPhase }'));
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /makeRemediation call at line 11 forwards a non-literal phase/);
  assert.equal(assigned.phases, undefined);
});

test('the assignment extractor halts fail-closed when a forwarding call site passes no object literal', () => {
  const assigned = extractAssignedPhases(withCallSite('options'));
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /does not pass an object literal/);
});

test('the assignment extractor halts fail-closed when a forwarding call site declares no phase', () => {
  const assigned = extractAssignedPhases(withCallSite("{ unitId: 'x' }"));
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /carries 0 phase keys/);
});

test('the assignment extractor halts fail-closed when the forwarding function is never called', () => {
  const assigned = extractAssignedPhases(`
export const meta = { phases: [{ title: 'Plan' }] };

function makeRemediation({ phase: phaseName }) {
  return { redispatch: () => agent(prompt, { phase: phaseName }) };
}

export function run() {
  phase('Plan');
  agent(prompt, { phase: 'Plan' });
}
`);
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /forwarding function makeRemediation has no resolvable call sites/);
});

test('the assignment extractor halts fail-closed on an identifier that binds to no parameter pattern', () => {
  const assigned = extractAssignedPhases(withBody('  agent(prompt, { phase: somePhase });'));
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /binds to no enclosing parameter pattern/);
});

test('the assignment extractor halts fail-closed on a phase value that is neither literal nor identifier', () => {
  const assigned = extractAssignedPhases(withBody('  agent(prompt, { phase: `Plan` });'));
  assert.equal(assigned.ok, false);
  assert.match(assigned.error, /neither a plain string literal nor an identifier/);
});

test('the call extractor halts fail-closed on a phase call that passes no string literal', () => {
  const source = `
export const meta = { phases: [{ title: 'Plan' }] };
export function run() {
  phase(currentPhase);
  agent(prompt, { phase: 'Plan' });
}
`;
  const called = extractCalledPhases(source);
  assert.equal(called.ok, false);
  assert.match(called.error, /does not pass a plain string literal/);
});

test('the extractors halt fail-closed on source they cannot scan', () => {
  const declared = extractDeclaredPhases("const unterminated = 'oops;\nexport const meta = {};\n");
  assert.equal(declared.ok, false);
  assert.match(declared.error, /could not be scanned/);
});

test('the declaration extractor halts fail-closed when no phases array exists', () => {
  const declared = extractDeclaredPhases('export const meta = { name: "x" };\n');
  assert.equal(declared.ok, false);
  assert.match(declared.error, /no meta\.phases array/);
});

test('the gate catches the declared-but-unused and used-but-undeclared pair in one pass', () => {
  const source = FORWARDING_SOURCE
    .replace("{ title: 'Ship' },", "{ title: 'Ship' },\n    { title: 'Final review' },")
    .replace("phase('Plan');", "phase('Shepherd');");
  const extracted = extractPhaseSurfaces(source);
  assert.equal(extracted.ok, true, extracted.error);
  const verdict = checkPhaseParity(extracted.surfaces);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverUsed, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
});

test('the argv parser accepts the phase-parity verb and defaults its target', () => {
  const parsed = parseMitosisGateArgv(['phase-parity']);
  assert.deepEqual(parsed, { ok: true, verb: 'phase-parity', target: DEFAULT_PHASE_PARITY_TARGET });
  assert.deepEqual([...MITOSIS_GATE_VERBS], ['phase-parity']);
});

test('the argv parser rejects an unknown verb, an unknown flag and a missing target value', () => {
  assert.equal(parseMitosisGateArgv([]).ok, false);
  assert.equal(parseMitosisGateArgv(['audit']).ok, false);
  assert.equal(parseMitosisGateArgv(['phase-parity', '--file', 'x.js']).ok, false);
  assert.equal(parseMitosisGateArgv(['phase-parity', '--target']).ok, false);
  assert.equal(parseMitosisGateArgv(['phase-parity', '--target', '--other']).ok, false);
});

test('the argv parser rejects a repeated target instead of silently taking the last', () => {
  const parsed = parseMitosisGateArgv(['phase-parity', '--target', 'a.js', '--target', 'b.js']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /--target was supplied more than once/);
});

test('the cli exits clean and prints the verdict for a balanced target', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', 'fixture.js'], out, () => FORWARDING_SOURCE);
  assert.equal(code, GATE_CLEAN_EXIT);
  assert.deepEqual(stderr, []);
  assert.deepEqual(JSON.parse(stdout.join('')).phases, ['Plan', 'Ship']);
});

test('the cli exits on the violation code and names both directions', () => {
  const source = FORWARDING_SOURCE
    .replace("{ title: 'Ship' },", "{ title: 'Ship' },\n    { title: 'Final review' },")
    .replace("phase('Plan');", "phase('Shepherd');");
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', 'fixture.js'], out, () => source);
  assert.equal(code, GATE_VIOLATION_EXIT);
  assert.deepEqual(stdout, []);
  assert.match(stderr.join(''), /declares phases that are never used: Final review/);
  assert.match(stderr.join(''), /uses phases that are never declared: Shepherd/);
});

test('the cli exits on the unresolvable code rather than reporting a false clean', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', 'fixture.js'], out, () => withCallSite('{ phase: chosenPhase }'));
  assert.equal(code, GATE_UNRESOLVABLE_EXIT);
  assert.deepEqual(stdout, []);
  assert.match(stderr.join(''), /phase-parity halted on fixture\.js/);
});

test('the cli exits on the usage code for a rejected argument vector', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(['audit'], out, () => FORWARDING_SOURCE);
  assert.equal(code, GATE_USAGE_EXIT);
  assert.match(stderr.join(''), /unknown verb/);
});

test('the cli exits on the read code when the target cannot be read', () => {
  const thrown = capture();
  const thrownCode = runMitosisGate(['phase-parity', '--target', 'missing.js'], thrown.out, () => {
    throw new Error('ENOENT: no such file');
  });
  assert.equal(thrownCode, GATE_READ_EXIT);
  assert.match(thrown.stderr.join(''), /could not read missing\.js: ENOENT/);

  const empty = capture();
  assert.equal(runMitosisGate(['phase-parity', '--target', 'empty.js'], empty.out, () => ''), GATE_READ_EXIT);
  assert.match(empty.stderr.join(''), /carried no readable source/);
});

test('the gate exit codes stay distinct from every sibling cli exit code', () => {
  const codes = [GATE_CLEAN_EXIT, GATE_USAGE_EXIT, GATE_VIOLATION_EXIT, GATE_UNRESOLVABLE_EXIT, GATE_READ_EXIT, GATE_COMPILE_EXIT];
  assert.equal(new Set(codes).size, codes.length);
  const siblings = new Set([
    MITOSIS_GIT_USAGE_EXIT,
    MITOSIS_GIT_TRIPWIRE_EXIT,
    MITOSIS_GIT_OBSERVE_EXIT,
    MITOSIS_GIT_CONVERGE_EXIT,
    MITOSIS_GIT_GH_MISSING_EXIT,
  ]);
  assert.ok(siblings.size >= 5, 'the sibling exit-code surface was imported, not transcribed');
  for (const code of codes.filter((c) => c !== GATE_CLEAN_EXIT)) {
    assert.equal(siblings.has(code), false, `exit code ${code} collides with a sibling cli`);
  }
});

test('the sandbox compile accepts the live workflow only after the ESM export prefix is stripped', () => {
  const source = liveSource();
  assert.match(source, /^export /m, 'the live workflow no longer carries the ESM prefix the normalization exists to strip');
  assert.equal(compileUnderSandbox(source).ok, true);
});

test('the sandbox compile halts fail-closed on a target that is not a compilable workflow body', () => {
  const compiled = compileUnderSandbox("export const meta = { phases: [{ title: 'Plan' }] };\nfunction (\n");
  assert.equal(compiled.ok, false);
  assert.match(compiled.error, /failed to compile in the sandbox/);
});

test('the cli exits on the compile code when the target does not compile under the sandbox', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(
    ['phase-parity', '--target', 'broken.js'],
    out,
    () => "export const meta = { phases: [{ title: 'Plan' }] };\nfunction (\n",
  );
  assert.equal(code, GATE_COMPILE_EXIT);
  assert.match(stderr.join(''), /broken\.js does not compile under the workflow sandbox/);
});
