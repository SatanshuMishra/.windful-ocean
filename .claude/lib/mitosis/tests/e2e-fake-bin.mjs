import { chmodSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UNIT_MARKER_PREFIX = 'mitosis-unit:';

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

let unitId = null;
for (const value of argv) {
  const found = MARKER.exec(value);
  if (found !== null) {
    unitId = found[1];
    break;
  }
}
if (unitId === null) {
  refuse(72, 'no argv value carries a unit marker, so the planned behaviour is unknown');
}
if (!Object.hasOwn(plan.units, unitId)) {
  refuse(73, 'the plan carries no entry for unit ' + JSON.stringify(unitId));
}

const unit = plan.units[unitId];

const MARKERS = plan.judgmentMarkers === null || typeof plan.judgmentMarkers !== 'object' ? {} : plan.judgmentMarkers;
const PROMPT = argv.length === 0 ? '' : argv[argv.length - 1];
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
    is_error: true,
    subtype: 'error_during_execution',
    result: typeof unit.reason === 'string' ? unit.reason : 'NEEDS_HUMAN',
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
