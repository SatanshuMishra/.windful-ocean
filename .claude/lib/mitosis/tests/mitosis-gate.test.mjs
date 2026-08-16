import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_CLEAN_EXIT,
  GATE_USAGE_EXIT,
  GATE_VIOLATION_EXIT,
  GATE_UNRESOLVABLE_EXIT,
  GATE_READ_EXIT,
  GATE_COMPILE_EXIT,
  MITOSIS_GATE_VERBS,
  DEFAULT_PHASE_PARITY_TARGET,
  DEFAULT_DETERMINISM_TARGET,
  DEFAULT_AGENT_TREE_TARGET,
  checkPhaseAuthority,
  checkPhaseParity,
  execAllowlistFailures,
  probeExecPolicy,
  compileUnderSandbox,
  extractDeclaredPhases,
  extractCalledPhases,
  extractAssignedPhases,
  extractPhaseSurfaces,
  parseMitosisGateArgv,
  runMitosisGate,
} from '../mitosis-gate.mjs';
import { scanJsStructure } from '../js-scan.mjs';
import { MERGE_REFUSAL_SPECIMENS } from '../gh-merge-shim.mjs';
import { PHASE_TITLES } from '../phases.mjs';
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

const AUTHORITATIVE_SOURCE = `
export const meta = {
  phases: [
${PHASE_TITLES.map((title) => `    { title: '${title}' },`).join('\n')}
  ],
};

export function run() {
${PHASE_TITLES.map((title) => `  phase('${title}');\n  agent(prompt, { label: 'step', phase: '${title}' });`).join('\n')}
}
`;

const FOREIGN_MODEL_TARGET = '/nonexistent-workflow-tree-xyz/other-workflow.js';

const FOREIGN_MODEL_SOURCE = `
export const meta = {
  phases: [
    { title: 'Execute' },
    { title: 'Integrate' },
    { title: 'Final review' },
  ],
};

export function run() {
  phase('Execute');
  agent(prompt, { label: 'step', phase: 'Execute' });
  phase('Integrate');
  agent(prompt, { label: 'step', phase: 'Integrate' });
  phase('Final review');
  agent(prompt, { label: 'step', phase: 'Final review' });
}
`;

function withDuplicateDeclaration(title) {
  return AUTHORITATIVE_SOURCE.replace(`    { title: '${title}' },`, `    { title: '${title}' },\n    { title: '${title}' },`);
}

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

const GATE_SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const gateTrees = [];

function gateTreeWithout(absentModule) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mitosis-gate-load-')));
  gateTrees.push(dir);
  for (const entry of readdirSync(GATE_SOURCE_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs') || entry.name === absentModule) continue;
    copyFileSync(join(GATE_SOURCE_DIR, entry.name), join(dir, entry.name));
  }
  return dir;
}

function runGateEntry(dir, argv) {
  try {
    const stdout = execFileSync('node', [join(dir, 'mitosis-gate.mjs'), ...argv], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

after(() => {
  for (const dir of gateTrees) rmSync(dir, { recursive: true, force: true });
  gateTrees.length = 0;
});

test('the pure checker flags a phase that is declared but never reached at all', () => {
  const verdict = checkPhaseParity({ ...BALANCED, declared: [...BALANCED.declared, 'Final review'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverCalled, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, []);
});

test('the pure checker flags a phase that is declared and assigned but never called', () => {
  const verdict = checkPhaseParity({ declared: ['Plan', 'Resume'], called: ['Plan'], assigned: ['Plan', 'Resume'] });
  assert.equal(
    verdict.ok,
    false,
    'a declared title carried only by an assigned {phase: ...} key has no call site, so the workflow never announces entering it; treating an assignment as entry is what let a declared-but-unentered phase sit in the model unnoticed',
  );
  assert.deepEqual(verdict.declaredNeverCalled, ['Resume']);
  assert.deepEqual(verdict.usedNeverDeclared, [], 'the assigned key is still a legitimate use of a declared title, so it must not be reported as undeclared');
});

test('the pure checker flags a phase that is used but never declared', () => {
  const verdict = checkPhaseParity({ ...BALANCED, called: [...BALANCED.called, 'Shepherd'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
  assert.deepEqual(verdict.declaredNeverCalled, []);
});

test('the pure checker still flags an assigned phase that is never declared, so tightening the call-site direction does not blind it to a typo', () => {
  const verdict = checkPhaseParity({ ...BALANCED, assigned: [...BALANCED.assigned, 'Shipp'] });
  assert.equal(
    verdict.ok,
    false,
    'dropping the assigned surface while tightening the declared-versus-called direction would make a misspelled {phase: ...} key invisible, since no phase() call carries it',
  );
  assert.deepEqual(verdict.usedNeverDeclared, ['Shipp']);
  assert.deepEqual(verdict.declaredNeverCalled, []);
});

test('the pure checker reports both directions at once', () => {
  const verdict = checkPhaseParity({ declared: ['Plan', 'Final review'], called: ['Plan'], assigned: ['Shepherd'] });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverCalled, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
});

test('the pure checker returns clean when the three surfaces agree', () => {
  const verdict = checkPhaseParity(BALANCED);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.declaredNeverCalled, []);
  assert.deepEqual(verdict.usedNeverDeclared, []);
  assert.deepEqual(verdict.declared, ['Plan', 'Ship']);
});

test('the authority check reddens in both directions, so neither copy of the phase model can drift alone', () => {
  const dropped = checkPhaseAuthority(['Probe'], ['Probe', 'Ship']);
  assert.equal(dropped.ok, false, 'a workflow that quietly drops a declared title still agrees with itself, so only the authority can catch the drop');
  assert.deepEqual(dropped.authorityNotDeclared, ['Ship']);
  assert.deepEqual(dropped.declaredNotInAuthority, []);

  const invented = checkPhaseAuthority(['Probe', 'Ship'], ['Probe']);
  assert.equal(invented.ok, false, 'a workflow that declares a title the authority never names is the same drift seen from the other side');
  assert.deepEqual(invented.declaredNotInAuthority, ['Ship']);
  assert.deepEqual(invented.authorityNotDeclared, []);

  const agreed = checkPhaseAuthority(['Ship', 'Probe'], ['Probe', 'Ship']);
  assert.equal(agreed.ok, true, 'the two copies name the same set, and order is not what the agreement is about');
});

test('the authority check halts on an authority it cannot read as a set of titles rather than letting the entry participate', () => {
  for (const malformed of [['Probe', 42], ['Probe', null], ['Probe', 'Probe'], ['Probe', ''], ['Probe', '   '], [], 'Probe', null]) {
    assert.throws(
      () => checkPhaseAuthority(['Probe'], malformed),
      TypeError,
      `the authority ${JSON.stringify(malformed)} cannot be read as a set of phase titles, and a membership test over it would let the unreadable entry take part in the comparison instead of halting the census`,
    );
  }
});

test('the parity checker halts on a declared surface that names one title twice, because the target is the side the gate exists to police', () => {
  assert.throws(
    () => checkPhaseParity({ ...BALANCED, declared: ['Plan', 'Ship', 'Ship'] }),
    TypeError,
    'a repeated declared title is silently collapsed the moment the surface becomes a set, and no reported count carries declared cardinality, so the duplicate can never be read back out of a green verdict; halting on the authority while collapsing the target guards the in-repo constant nobody attacks and lets the --target file through',
  );
});

test('the authority check halts on a declared surface that names one title twice, on the same argument that halts on a repeated authority title', () => {
  assert.throws(
    () => checkPhaseAuthority(['Probe', 'Ship', 'Ship'], ['Probe', 'Ship']),
    TypeError,
    'the declared surface and the authority are compared as two sets, so a declared list this census cannot read as a set is unclassifiable on exactly the argument that already halts the authority',
  );
});

test('the authority check rejects a declared surface that is not an array of non-empty strings', () => {
  assert.throws(() => checkPhaseAuthority('Probe', ['Probe']), TypeError);
  assert.throws(() => checkPhaseAuthority([], ['Probe']), TypeError);
  assert.throws(() => checkPhaseAuthority(['Probe', '  '], ['Probe']), TypeError);
});

test('the authority check leaves its inputs unmutated and freezes its verdict', () => {
  const declared = ['Ship', 'Probe'];
  const authority = ['Probe', 'Ship'];
  const verdict = checkPhaseAuthority(declared, authority);
  assert.deepEqual(declared, ['Ship', 'Probe']);
  assert.deepEqual(authority, ['Probe', 'Ship']);
  assert.equal(Object.isFrozen(verdict), true);
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
  assert.deepEqual(verdict.declaredNeverCalled, [], 'the live workflow declares no phase it never calls');
  assert.deepEqual(verdict.usedNeverDeclared, [], 'the live workflow uses no undeclared phase');
  assert.equal(verdict.ok, true);
  const agreement = checkPhaseAuthority(extracted.surfaces.declared, PHASE_TITLES);
  assert.deepEqual(agreement.declaredNotInAuthority, [], 'the live workflow declares no phase the authority never names');
  assert.deepEqual(agreement.authorityNotDeclared, [], 'the authority names no phase the live workflow never declares');
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
  assert.deepEqual([...extracted.surfaces.assigned], ['Plan'], 'a literal only a dead binding carries is not an assignment the run can reach');
  const verdict = checkPhaseParity(extracted.surfaces);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverCalled, ['Final review']);
});

test('a phase literal in a referenced binding is collected as a reachable assignment', () => {
  const extracted = extractPhaseSurfaces(withBody(
    "  const base = { label: 'b', phase: 'Ship' };\n  agent(p, { ...base });",
    "{ title: 'Plan' }, { title: 'Ship' }",
  ));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 0);
  assert.deepEqual([...extracted.surfaces.assigned].sort(), ['Plan', 'Ship']);
});

test('a phase literal in a returned object is collected as a reachable assignment', () => {
  const extracted = extractPhaseSurfaces(withBody(
    "  return { label: 'b', phase: 'Ship' };",
    "{ title: 'Plan' }, { title: 'Ship' }",
  ));
  assert.equal(extracted.ok, true, extracted.error);
  assert.equal(extracted.counts.dead, 0);
  assert.deepEqual([...extracted.surfaces.assigned].sort(), ['Plan', 'Ship']);
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

test('the gate catches the declared-but-uncalled and used-but-undeclared pair in one pass', () => {
  const source = FORWARDING_SOURCE
    .replace("{ title: 'Ship' },", "{ title: 'Ship' },\n    { title: 'Final review' },")
    .replace("phase('Plan');", "phase('Plan');\n  phase('Shepherd');");
  const extracted = extractPhaseSurfaces(source);
  assert.equal(extracted.ok, true, extracted.error);
  const verdict = checkPhaseParity(extracted.surfaces);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.declaredNeverCalled, ['Final review']);
  assert.deepEqual(verdict.usedNeverDeclared, ['Shepherd']);
});

test('the argv parser accepts every verb and defaults each to its own target', () => {
  assert.deepEqual(parseMitosisGateArgv(['phase-parity']), { ok: true, verb: 'phase-parity', target: DEFAULT_PHASE_PARITY_TARGET });
  assert.deepEqual(parseMitosisGateArgv(['determinism']), { ok: true, verb: 'determinism', target: DEFAULT_DETERMINISM_TARGET });
  assert.deepEqual(parseMitosisGateArgv(['exec-allowlist']), { ok: true, verb: 'exec-allowlist', target: null });
  assert.deepEqual(parseMitosisGateArgv(['dispatchable-agent-schema-capable']), { ok: true, verb: 'dispatchable-agent-schema-capable', target: DEFAULT_AGENT_TREE_TARGET });
  assert.deepEqual([...MITOSIS_GATE_VERBS], ['determinism', 'dispatchable-agent-schema-capable', 'exec-allowlist', 'phase-parity']);
  assert.notEqual(DEFAULT_DETERMINISM_TARGET, DEFAULT_PHASE_PARITY_TARGET);
});

test('the schema verb exits clean over the real agent tree and names the derived dispatch table', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['dispatchable-agent-schema-capable'], out, (path) => readFileSync(path, 'utf8'));
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  const verdict = JSON.parse(stdout.join(''));
  assert.deepEqual(verdict.dispatchable, [
    'code-reviewer', 'codebase-analyst', 'implementer', 'security-reviewer', 'test-engineer',
  ], 'the census root is the lib engine source alone; debugger and solution-architect were named only by the legacy workflow file, which is no longer a root');
});

test('the schema verb exits on the read code when the agent tree cannot be read', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(['dispatchable-agent-schema-capable', '--target', '/nonexistent-agent-tree-xyz/'], out, (path) => readFileSync(path, 'utf8'));
  assert.equal(code, GATE_READ_EXIT);
  assert.match(stderr.join(''), /nonexistent-agent-tree-xyz/);
});

test('the exec-allowlist verb exits clean against the real policy module', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['exec-allowlist'], out, () => '');
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  const verdict = JSON.parse(stdout.join(''));
  assert.deepEqual(verdict.allowlist, ['claude', 'gh', 'git', 'graphify', 'node']);
});

test('the exec-allowlist verb probes every merge argv the no-merge guarantee names, by refusal reason', () => {
  const { out, stdout } = capture();
  runMitosisGate(['exec-allowlist'], out, () => '');
  const verdict = JSON.parse(stdout.join(''));
  const declared = Object.fromEntries(MERGE_REFUSAL_SPECIMENS.map((specimen) => [specimen.label, specimen.kind]));
  assert.deepEqual(verdict.refusals, declared);
});

test('a merge argv that stops being refused is a failure naming the argv, not a silent pass', () => {
  const labels = Object.keys(probeExecPolicy().refusals);
  assert.ok(labels.length > 0, 'the verb probes no merge argv at all, so this relation asserts nothing');
  for (const label of labels) {
    const policy = probeExecPolicy();
    const failures = execAllowlistFailures({
      ...policy,
      refusals: { ...policy.refusals, [label]: null },
    });
    assert.equal(failures.length, 1, `dropping the refusal of ${label} must produce exactly one failure`);
    assert.match(failures[0], new RegExp(label.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')));
  }
});

test('a merge argv refused for a different reason is a failure, because the reason is the guarantee', () => {
  const policy = probeExecPolicy();
  const failures = execAllowlistFailures({
    ...policy,
    refusals: { ...policy.refusals, 'pr merge': 'graphql-fail-closed' },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /pr-merge/);
  assert.match(failures[0], /graphql-fail-closed/);
});

test('an allowlist that is not a readable list is reported as a failure rather than crashing the verb', () => {
  for (const allowlist of [undefined, null, 'claude,gh', 42]) {
    const failures = execAllowlistFailures({ ...probeExecPolicy(), allowlist });
    assert.ok(failures.length >= 1, JSON.stringify(allowlist));
    assert.match(failures[0], /allowlist/);
  }
});

test('the exec-allowlist verdict declares what it attests and refuses to imply the rest', () => {
  const { out, stdout } = capture();
  runMitosisGate(['exec-allowlist'], out, () => '');
  const verdict = JSON.parse(stdout.join(''));
  assert.equal(verdict.probed, undefined, 'the verb opens no path, so it must not report one as probed');
  assert.ok(Array.isArray(verdict.attests) && verdict.attests.length > 0);
  assert.ok(Array.isArray(verdict.notAttested) && verdict.notAttested.length > 0);
  assert.ok(
    verdict.notAttested.some((claim) => /spawn site/.test(claim)),
    'no verb of this gate censuses the spawn sites, so the verdict must not read as process containment',
  );
  assert.ok(
    verdict.notAttested.some((claim) => /argv/.test(claim)),
    'node, git and claude reach arbitrary work through argv with no policy, so the verdict must say so',
  );
});

test('the exec-allowlist verb rejects a target, because it probes an imported module and opens no path', () => {
  const parsed = parseMitosisGateArgv(['exec-allowlist', '--target', '/etc/passwd']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /exec-allowlist/);
  const { out, stderr } = capture();
  assert.equal(runMitosisGate(['exec-allowlist', '--target', '/etc/passwd'], out, () => ''), GATE_USAGE_EXIT);
  assert.match(stderr.join(''), /exec-allowlist/);
});

test('the determinism verb exits clean over the real engine source', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['determinism'], out, (path) => readFileSync(path, 'utf8'));
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  const verdict = JSON.parse(stdout.join(''));
  assert.equal(verdict.verb, 'determinism');
  assert.ok(verdict.fileCount > 30, `expected the whole engine directory, found ${verdict.fileCount}`);
});

test('the determinism verb exits on the violation code and names the file, line and identifier', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['determinism'], out, () => 'const stamp = Date.now();\n');
  assert.equal(code, GATE_VIOLATION_EXIT);
  assert.deepEqual(stdout, []);
  assert.match(stderr.join(''), /mitosis-gate\.mjs:1 reads Date as a bare read/);
});

test('the determinism verb halts rather than guessing at a receiver it cannot read', () => {
  const { out } = capture();
  const code = runMitosisGate(['determinism'], out, () => 'const stamp = (receiver).Date;\n');
  assert.equal(code, GATE_UNRESOLVABLE_EXIT);
});

test('the determinism verb exits on the read code when a root cannot be enumerated', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(['determinism', '--target', '/nonexistent-engine-dir-xyz/'], out, () => '');
  assert.equal(code, GATE_READ_EXIT);
  assert.match(stderr.join(''), /nonexistent-engine-dir-xyz/);
});

test('the argv parser rejects an unknown verb, an unknown flag and a missing target value', () => {
  assert.equal(parseMitosisGateArgv([]).ok, false);
  assert.equal(parseMitosisGateArgv(['audit']).ok, false);
  assert.match(parseMitosisGateArgv(['audit']).error, new RegExp(MITOSIS_GATE_VERBS.join(', ')));
  assert.equal(parseMitosisGateArgv(['phase-parity', '--file', 'x.js']).ok, false);
  assert.equal(parseMitosisGateArgv(['phase-parity', '--target']).ok, false);
  assert.equal(parseMitosisGateArgv(['phase-parity', '--target', '--other']).ok, false);
});

test('the argv parser rejects a repeated target instead of silently taking the last', () => {
  const parsed = parseMitosisGateArgv(['phase-parity', '--target', 'a.js', '--target', 'b.js']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /--target was supplied more than once/);
});

test('the cli exits clean and prints the verdict for a target that both agrees with the authority and calls every phase it declares', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], out, () => AUTHORITATIVE_SOURCE);
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  assert.deepEqual(
    JSON.parse(stdout.join('')).phases,
    ['Decompose', 'Execute', 'Integrate', 'Prep', 'Probe', 'Remediate', 'Resume', 'Ship'],
    'the verdict reports the phases it checked, so a reader can see which model went green rather than only that something did',
  );
});

test('the cli exits on the violation code and names both parity directions', () => {
  const source = AUTHORITATIVE_SOURCE
    .replace("  phase('Resume');\n", '')
    .replace("  phase('Probe');", "  phase('Shepherd');\n  phase('Probe');");
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], out, () => source);
  assert.equal(code, GATE_VIOLATION_EXIT);
  assert.deepEqual(stdout, []);
  assert.match(
    stderr.join(''),
    /declares phases that are never called: Resume/,
    'Resume is still declared and still carried by an assigned {phase: ...} key here; only the call site is gone, which is the exact shape of the defect this verb exists to catch',
  );
  assert.match(stderr.join(''), /uses phases that are never declared: Shepherd/);
});

test('the cli exits on the violation code and names both authority directions', () => {
  const source = AUTHORITATIVE_SOURCE.split("'Ship'").join("'Shipp'");
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], out, () => source);
  assert.equal(
    code,
    GATE_VIOLATION_EXIT,
    'the renamed target is internally consistent — it declares, calls and assigns Shipp — so only a comparison against the authority can catch that the model was renamed in one copy',
  );
  assert.deepEqual(stdout, []);
  assert.match(stderr.join(''), /declares phases the phase authority does not name: Shipp/);
  assert.ok(stderr.join('').includes(`the phase authority names phases ${DEFAULT_PHASE_PARITY_TARGET} never declares: Ship`));
});

test('the cli exits on the unresolvable code rather than reporting a false clean', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], out, () => withCallSite('{ phase: chosenPhase }'));
  assert.equal(code, GATE_UNRESOLVABLE_EXIT);
  assert.deepEqual(stdout, []);
  assert.ok(stderr.join('').includes(`phase-parity halted on ${DEFAULT_PHASE_PARITY_TARGET}`));
});

test('the cli routes a target that declares one title twice to the unresolvable exit instead of a receipt that collapses the duplicate', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], out, () => withDuplicateDeclaration('Ship'));
  assert.equal(
    code,
    GATE_UNRESOLVABLE_EXIT,
    'this target declares nine entries naming eight titles and is otherwise in parity, so collapsing the declared surface into a set exits clean and prints a receipt naming eight — a green verdict over a declaration the census never actually read',
  );
  assert.deepEqual(stdout, [], 'a halted census prints no receipt, because a receipt is the assurance the halt exists to withhold');
  assert.match(stderr.join(''), /"Ship" is named twice/);
});

test('the phase-parity verb halts on a target it holds no phase authority for, rather than judging it against a model it never owned', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', FOREIGN_MODEL_TARGET], out, () => FOREIGN_MODEL_SOURCE);
  assert.equal(
    code,
    GATE_UNRESOLVABLE_EXIT,
    'the verb advertises --target, so binding one global authority to every target reports a spurious authority break for any workflow that legitimately owns a different phase model',
  );
  assert.deepEqual(stdout, []);
  assert.ok(stderr.join('').includes(FOREIGN_MODEL_TARGET), 'the halt names the target it cannot judge');
  assert.equal(
    stderr.join('').includes('declares phases the phase authority does not name'),
    false,
    'an unmapped target is unclassifiable, not in breach; reporting a break would tell the operator to rename a model that is not governed by this authority',
  );
});

test('the phase authority is keyed to the resolved target, so the default target reached by a relative path is still the mapped one', () => {
  const relativeTarget = relative(process.cwd(), DEFAULT_PHASE_PARITY_TARGET);
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['phase-parity', '--target', relativeTarget], out, () => AUTHORITATIVE_SOURCE);
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT, 'keying the authority on the raw argument string would leave the same file mapped or unmapped depending on how the operator spelled the path');
  assert.deepEqual(JSON.parse(stdout.join('')).phases, [...PHASE_TITLES].sort());
});

test('the cli exits on the usage code for a rejected argument vector', () => {
  const { out, stderr } = capture();
  const code = runMitosisGate(['audit'], out, () => FORWARDING_SOURCE);
  assert.equal(code, GATE_USAGE_EXIT);
  assert.match(stderr.join(''), /unknown verb/);
});

test('the cli exits on the read code when the target cannot be read', () => {
  const thrown = capture();
  const thrownCode = runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], thrown.out, () => {
    throw new Error('ENOENT: no such file');
  });
  assert.equal(thrownCode, GATE_READ_EXIT);
  assert.ok(thrown.stderr.join('').includes(`could not read ${DEFAULT_PHASE_PARITY_TARGET}: ENOENT`));

  const empty = capture();
  assert.equal(runMitosisGate(['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET], empty.out, () => ''), GATE_READ_EXIT);
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
    ['phase-parity', '--target', DEFAULT_PHASE_PARITY_TARGET],
    out,
    () => "export const meta = { phases: [{ title: 'Plan' }] };\nfunction (\n",
  );
  assert.equal(code, GATE_COMPILE_EXIT);
  assert.ok(stderr.join('').includes(`${DEFAULT_PHASE_PARITY_TARGET} does not compile under the workflow sandbox`));
});

test('a module in the gate closure that does not resolve halts under the gate frame, naming the verb that never ran and the module that did not load', () => {
  const dir = gateTreeWithout('phases.mjs');
  const absent = join(dir, 'phases.mjs');
  const run = runGateEntry(dir, ['determinism']);
  assert.equal(
    run.status,
    GATE_UNRESOLVABLE_EXIT,
    'linking finishes before the verb table or any framed refusal exists, so without a boundary the operator reads a resolver stack on the generic failure code instead of this gate halting on a module it cannot resolve',
  );
  assert.equal(run.stdout, '', 'a gate that never ran prints no receipt');
  assert.equal(
    run.stderr,
    `mitosis-gate: ${absent} did not load, so the "determinism" verb never ran: Cannot find module '${absent}' imported from ${join(dir, 'mitosis-gate-core.mjs')}\n`,
  );
});

test('a gate module the entry cannot resolve at all is framed the same way, naming the requested verb or reporting that none was requested', () => {
  const dir = gateTreeWithout('mitosis-gate-core.mjs');
  const absent = join(dir, 'mitosis-gate-core.mjs');
  const named = runGateEntry(dir, ['phase-parity']);
  assert.equal(named.status, GATE_UNRESOLVABLE_EXIT);
  assert.equal(named.stdout, '');
  assert.equal(
    named.stderr,
    `mitosis-gate: ${absent} did not load, so the "phase-parity" verb never ran: Cannot find module './mitosis-gate-core.mjs'\n`,
    'the failure carries no url of its own, so the frame names the module the entry asked for rather than dropping the module from the diagnosis',
  );
  const bare = runGateEntry(dir, []);
  assert.equal(bare.status, GATE_UNRESOLVABLE_EXIT);
  assert.equal(bare.stderr, `mitosis-gate: ${absent} did not load, so no verb ran: Cannot find module './mitosis-gate-core.mjs'\n`);
});
