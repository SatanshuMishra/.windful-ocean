import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UNIT_MARKER_PREFIX = 'mitosis-unit:';

export const BOUNDARY_VIOLATION_TOKEN = 'BOUNDARY_VIOLATION';

export const BOUNDARY_REPAIRS = Object.freeze(['clear', 'none']);

export const FIXTURE_LINT_RULE = 'fixture/no-boundary-violation';

export const FIXTURE_LINT_MESSAGE = 'fixture boundary violation';

export const FAKE_ENV_KEYS = Object.freeze({
  claudeRecord: 'MITOSIS_FAKE_CLAUDE_RECORD',
  claudePlan: 'MITOSIS_FAKE_CLAUDE_PLAN',
  claudeState: 'MITOSIS_FAKE_CLAUDE_STATE',
  ghRecord: 'MITOSIS_FAKE_GH_RECORD',
  ghPlan: 'MITOSIS_FAKE_GH_PLAN',
});

export const CLAUDE_BEHAVIOURS = Object.freeze({
  succeed: 'succeed',
  succeedWithoutStructuredOutput: 'succeed-without-structured-output',
  fail: 'fail',
  failThenSucceed: 'fail-then-succeed',
  needsHuman: 'needs-human',
});

export const CLAUDE_BEHAVIOUR_NAMES = Object.freeze(Object.values(CLAUDE_BEHAVIOURS));

const EXECUTABLE_MODE = 0o755;

const CLAUDE_SOURCE = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const RECORD = process.env.MITOSIS_FAKE_CLAUDE_RECORD;
const PLAN = process.env.MITOSIS_FAKE_CLAUDE_PLAN;
const STATE = process.env.MITOSIS_FAKE_CLAUDE_STATE;
const MARKER = /mitosis-unit:([a-z0-9][a-z0-9-]*)/;

function refuse(code, message) {
  fs.writeSync(2, 'fake-claude: ' + message + '\n');
  process.exit(code);
}

const argv = process.argv.slice(2);

if (!RECORD || !PLAN || !STATE) {
  refuse(70, 'the environment names no recorder, plan and state path, so no planned behaviour can be selected');
}

fs.appendFileSync(RECORD, JSON.stringify(argv) + '\n');

let plan = null;
try {
  plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
} catch (error) {
  refuse(71, 'the plan at ' + PLAN + ' did not parse: ' + error.message);
}
if (plan === null || typeof plan !== 'object' || plan.units === null || typeof plan.units !== 'object') {
  refuse(71, 'the plan at ' + PLAN + ' carries no units object');
}

const PROMPT = argv.length === 0 ? '' : argv[argv.length - 1];

function boundaryFixPlan() {
  const declared = plan.boundaryFix;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) return null;
  if (typeof declared.marker !== 'string' || declared.marker === '') return null;
  if (typeof PROMPT !== 'string' || !PROMPT.includes(declared.marker)) return null;
  return declared;
}

function clearViolations(boundary) {
  if (!Array.isArray(boundary.files) || typeof boundary.token !== 'string' || boundary.token === '') {
    refuse(79, 'the boundary-fix plan asks for a repair but names no files and token to clear, so the repair would silently do nothing');
  }
  for (const file of boundary.files) {
    let source = null;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (error) {
      refuse(79, 'the boundary-fix repair could not read ' + file + ': ' + error.message);
    }
    fs.writeFileSync(file, source.split('\n').filter((line) => !line.includes(boundary.token)).join('\n'));
  }
}

const REPAIRS = ${JSON.stringify(BOUNDARY_REPAIRS)};

const boundary = boundaryFixPlan();
if (boundary !== null) {
  if (!REPAIRS.includes(boundary.repair)) {
    refuse(79, 'the boundary-fix plan names the repair ' + JSON.stringify(boundary.repair) + ', which is neither ' + REPAIRS.join(' nor '));
  }
  if (boundary.repair === 'clear') clearViolations(boundary);
  emit(envelope({ result: 'boundary-fix repair ' + boundary.repair }));
}

function decomposePlan() {
  const declared = plan.decompose;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) return null;
  if (typeof declared.marker !== 'string' || declared.marker === '') return null;
  if (typeof PROMPT !== 'string' || !PROMPT.includes(declared.marker)) return null;
  return declared;
}

const decomposed = decomposePlan();
if (decomposed !== null) {
  if (!Array.isArray(decomposed.msps) || decomposed.msps.length === 0) {
    refuse(80, 'the decompose plan names no msps, so the emitter would compose a run document from an empty decomposition');
  }
  emit(envelope({ structured_output: { msps: decomposed.msps } }));
}

let unitId = null;
for (const value of argv) {
  const found = MARKER.exec(value);
  if (found !== null) {
    unitId = found[1];
    break;
  }
}
function tokenUnitId() {
  const tokens = plan.unitTokens;
  if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  if (typeof PROMPT !== 'string') return null;
  const matched = Object.keys(tokens).filter((id) => typeof tokens[id] === 'string' && tokens[id] !== '' && PROMPT.indexOf(tokens[id]) !== -1);
  if (matched.length > 1) {
    refuse(81, 'the prompt carries the tokens of ' + matched.join(' and ') + ', so the planned behaviour is ambiguous and the stub refuses rather than picking one');
  }
  return matched.length === 1 ? matched[0] : null;
}

if (unitId === null) {
  unitId = tokenUnitId();
}
if (unitId === null) {
  refuse(72, 'no argv value carries a unit marker and no planned unit token appears in the prompt, so the planned behaviour is unknown');
}
if (!Object.hasOwn(plan.units, unitId)) {
  refuse(73, 'the plan carries no entry for unit ' + JSON.stringify(unitId));
}

const unit = plan.units[unitId];

const MARKERS = plan.judgmentMarkers === null || typeof plan.judgmentMarkers !== 'object' ? {} : plan.judgmentMarkers;
const VERDICTS = ['pass', 'fail'];

function markerKind() {
  if (typeof PROMPT !== 'string') return null;
  if (typeof MARKERS.security === 'string' && MARKERS.security !== '' && PROMPT.includes(MARKERS.security)) return 'security';
  if (typeof MARKERS.review === 'string' && MARKERS.review !== '' && PROMPT.includes(MARKERS.review)) return 'review';
  return null;
}

function envelope(extra) {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    session_id: 'fake-session-00000000',
    num_turns: 1,
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: null,
    permission_denials: [],
    api_error_status: null,
    ...extra,
  });
}

function emit(text) {
  fs.writeSync(1, text);
  process.exit(0);
}

function refuseWith(stream, code) {
  if (typeof stream === 'string' && stream.length > 0) fs.writeSync(2, stream + '\n');
  process.exit(code);
}

function succeed() {
  if (typeof unit.sha !== 'string' || !/^[0-9a-f]{40}$/.test(unit.sha)) {
    refuse(74, 'unit ' + unitId + ' is planned to succeed but its sha ' + JSON.stringify(unit.sha) + ' is not a 40-character hexadecimal commit id');
  }
  emit(envelope({ structured_output: { sha: unit.sha } }));
}

const judged = markerKind();
if (judged !== null) {
  const declared = unit[judged + 'Verdict'];
  if (declared !== undefined && !VERDICTS.includes(declared)) {
    refuse(78, 'unit ' + unitId + ' plans the ' + judged + ' verdict ' + JSON.stringify(declared) + ', which is neither pass nor fail');
  }
  const verdict = declared === undefined ? 'pass' : declared;
  const issues = verdict === 'fail' ? ['fixture ' + judged + ' issue for unit ' + unitId] : [];
  emit(envelope({ structured_output: verdict === 'fail' ? { verdict: verdict, issues: issues } : { verdict: verdict } }));
}

if (unit.behaviour === 'succeed') succeed();

if (unit.behaviour === 'succeed-without-structured-output') {
  emit(envelope({ result: typeof unit.result === 'string' ? unit.result : 'DONE' }));
}

if (unit.behaviour === 'needs-human') {
  emit(envelope({
    structured_output: {
      sha: null,
      needsHuman: true,
      needsHumanReason: typeof unit.reason === 'string' ? unit.reason : 'NEEDS_HUMAN',
    },
  }));
}

if (unit.behaviour === 'fail') {
  refuseWith(unit.stderr, Number.isInteger(unit.exitCode) ? unit.exitCode : 1);
}

if (unit.behaviour === 'fail-then-succeed') {
  const counter = path.join(STATE, unitId + '.count');
  let seen = 0;
  try {
    seen = Number.parseInt(fs.readFileSync(counter, 'utf8'), 10);
  } catch (error) {
    seen = 0;
  }
  if (!Number.isInteger(seen) || seen < 0) {
    refuse(75, 'the invocation counter at ' + counter + ' does not hold a whole number of prior invocations');
  }
  fs.writeFileSync(counter, String(seen + 1));
  if (seen === 0) {
    refuseWith(unit.stderr, Number.isInteger(unit.failExitCode) ? unit.failExitCode : 1);
  }
  succeed();
}

refuse(76, 'the plan names the behaviour ' + JSON.stringify(unit.behaviour) + ', which this stub does not implement');
`;

const GH_SOURCE = String.raw`
const fs = require('node:fs');

const RECORD = process.env.MITOSIS_FAKE_GH_RECORD;
const PLAN = process.env.MITOSIS_FAKE_GH_PLAN;

function refuse(code, message) {
  fs.writeSync(2, 'fake-gh: ' + message + '\n');
  process.exit(code);
}

const argv = process.argv.slice(2);

if (!RECORD || !PLAN) {
  refuse(70, 'the environment names no recorder and plan path, so no planned reply can be selected');
}

fs.appendFileSync(RECORD, JSON.stringify(argv) + '\n');

let plan = null;
try {
  plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
} catch (error) {
  refuse(71, 'the plan at ' + PLAN + ' did not parse: ' + error.message);
}
if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
  refuse(71, 'the plan at ' + PLAN + ' carries no steps array');
}

const step = plan.steps.find((candidate) => candidate !== null
  && typeof candidate === 'object'
  && Array.isArray(candidate.argvPrefix)
  && candidate.argvPrefix.length <= argv.length
  && candidate.argvPrefix.every((token, index) => token === argv[index]));

if (step === undefined) {
  refuse(77, 'no planned step matches the argv ' + JSON.stringify(argv) + '; the fake refuses rather than replying with a reply nobody planned');
}

if (typeof step.stdout === 'string' && step.stdout.length > 0) fs.writeSync(1, step.stdout);
if (typeof step.stderr === 'string' && step.stderr.length > 0) fs.writeSync(2, step.stderr);
process.exit(Number.isInteger(step.exitCode) ? step.exitCode : 0);
`;

const ESLINT_SOURCE = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const TOKEN = ${JSON.stringify(BOUNDARY_VIOLATION_TOKEN)};
const RULE = ${JSON.stringify(FIXTURE_LINT_RULE)};
const MESSAGE = ${JSON.stringify(FIXTURE_LINT_MESSAGE)};
const argv = process.argv.slice(2);

function refuse(code, message) {
  fs.writeSync(2, 'fixture-eslint: ' + message + '\n');
  process.exit(code);
}

function walk(directory, found) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full, found);
      continue;
    }
    if (entry.isFile()) found.push(full);
  }
  return found;
}

if (argv[0] === '--print-config') {
  fs.writeSync(1, JSON.stringify({ rules: { [RULE]: 'error' } }));
  process.exit(0);
}

const root = argv[0];
if (typeof root !== 'string' || root.length === 0 || !fs.existsSync(root)) {
  refuse(2, 'the first argument must name a directory to lint, received ' + JSON.stringify(root));
}

const report = walk(root, []).sort().map((filePath) => {
  const messages = [];
  fs.readFileSync(filePath, 'utf8').split('\n').forEach((line, index) => {
    if (line.includes(TOKEN)) messages.push({ ruleId: RULE, message: MESSAGE, line: index + 1, column: 1, severity: 2 });
  });
  return { filePath: filePath, messages: messages };
});

fs.writeSync(1, JSON.stringify(report));
process.exit(report.some((entry) => entry.messages.length > 0) ? 1 : 0);
`;

export function writeFixtureLinter(nodeModules) {
  const binDirectory = join(nodeModules, '.bin');
  mkdirSync(binDirectory, { recursive: true });
  writeFileSync(join(binDirectory, 'package.json'), '{"type":"commonjs"}\n');
  const target = join(binDirectory, 'eslint');
  writeFileSync(target, ESLINT_SOURCE);
  chmodSync(target, EXECUTABLE_MODE);
  return target;
}

function writeExecutable(directory, name, nodePath, source) {
  const target = join(directory, name);
  writeFileSync(target, `#!${nodePath}\n${source}`);
  chmodSync(target, EXECUTABLE_MODE);
  return target;
}

export function writeFakeBin(directory, binaries) {
  if (typeof binaries.node !== 'string' || binaries.node.length === 0) {
    throw new TypeError('e2e-fake-bin: writeFakeBin needs the absolute path of a real node to place on the sandbox PATH');
  }
  if (typeof binaries.git !== 'string' || binaries.git.length === 0) {
    throw new TypeError('e2e-fake-bin: writeFakeBin needs the absolute path of a real git to place on the sandbox PATH');
  }
  writeFileSync(join(directory, 'package.json'), '{"type":"commonjs"}\n');
  const claude = writeExecutable(directory, 'claude', binaries.node, CLAUDE_SOURCE);
  const gh = writeExecutable(directory, 'gh', binaries.node, GH_SOURCE);
  symlinkSync(binaries.node, join(directory, 'node'));
  symlinkSync(binaries.git, join(directory, 'git'));
  return Object.freeze({ claude, gh, node: join(directory, 'node'), git: join(directory, 'git') });
}

export function unitIdOfArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const value of argv) {
    if (typeof value !== 'string') continue;
    const found = new RegExp(`${UNIT_MARKER_PREFIX}([a-z0-9][a-z0-9-]*)`).exec(value);
    if (found !== null) return found[1];
  }
  return null;
}
