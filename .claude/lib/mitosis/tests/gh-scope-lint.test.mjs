import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MITOSIS_GIT_CONVERGE_EXIT, FLAG_SPEC, parseMitosisGitArgv } from '../../git/pr.mjs';
import { PR_TITLE_PATTERN, PR_VALUE_CAP, inertValue } from '../../git/pr-format.mjs';

const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;
const source = readFileSync(MITOSIS_PATH, 'utf8');

const GH_ACTION = /gh (pr|api|run|issue)\b/g;
const SCOPE_TOKENS = [' -R ', '${repoSlug}'];
const CODE_SPAN_CLOSE = '\\`';
const PLACEHOLDER = '<OWNER_REPO>';
const LIB_DIR_NAME = 'LIB_DIR';
const LIB_DIR_LITERAL = '/Users/satanshumishra/.claude/lib/mitosis';
const LIB_DIR_TEMPLATE = '${LIB_DIR}';
const GIT_LIB_DIR_NAME = 'GIT_LIB_DIR';
const GIT_LIB_DIR_LITERAL = '/Users/satanshumishra/.claude/lib/git';
const PR_TOOL_INVOCATION = 'node ${GIT_LIB_DIR}/pr.mjs pr-create';
const PR_CREATE_SITES = 2;
const RECONCILE_PLACEHOLDER_SITES = [
  `gh pr list -R ${PLACEHOLDER} --state merged --base `,
  `gh pr list -R ${PLACEHOLDER} --state open --base `,
];

function ghActionSites(src) {
  const positions = [...src.matchAll(GH_ACTION)].map((m) => m.index);
  return positions.map((start, i) => {
    const bounds = [];
    const closeSpan = src.indexOf(CODE_SPAN_CLOSE, start + 3);
    const newline = src.indexOf('\n', start);
    if (closeSpan >= 0) bounds.push(closeSpan);
    if (newline >= 0) bounds.push(newline);
    if (i + 1 < positions.length) bounds.push(positions[i + 1]);
    const end = bounds.length ? Math.min(...bounds) : src.length;
    return { index: start, command: src.slice(start, end) };
  });
}

function isScoped(command) {
  return SCOPE_TOKENS.some((token) => command.includes(token));
}

test('the engine embeds the known gh action sites (regression tripwire against silent removal)', () => {
  const sites = ghActionSites(source);
  assert.ok(sites.length >= 9, `expected at least the known gh (pr|api|run) action sites, found ${sites.length}`);
});

test('every gh (pr|api|run|issue) command in the engine is repo-scoped and never resolves the ambient cwd repo', () => {
  const unscoped = ghActionSites(source).filter((site) => !isScoped(site.command));
  assert.deepEqual(
    unscoped.map((site) => site.command.trim()),
    [],
    'these gh commands carry no -R / $repoSlug / $(cd ${repoRoot}) scope and would resolve the ambient repository (silent-wrong-repo defect)',
  );
});

test('MSP-2 FIX4: an un-substituted <OWNER_REPO> placeholder is NOT by itself repo scope — the lint must still catch a gh read scoped only by a placeholder', () => {
  assert.equal(isScoped('gh api "repos/<OWNER_REPO>/compare/a...b"'), false, 'a placeholder-only gh read is unscoped: the shell parses <OWNER_REPO> as an input redirection and the command never runs');
  assert.equal(isScoped('gh pr list <OWNER_REPO> --state merged'), false, 'a placeholder without -R is unscoped');
  assert.equal(isScoped('gh pr list -R <OWNER_REPO> --state merged'), true, 'the reconcile sites are scoped by the -R flag itself, not by the placeholder');
});

test('MSP-2 FIX4: the <OWNER_REPO> placeholder is confined to the two whitelisted reconcile list sites, each carrying its own -R flag', () => {
  for (const site of RECONCILE_PLACEHOLDER_SITES) {
    assert.equal(source.split(site).length - 1, 1, `expected exactly one whitelisted placeholder site: ${site}`);
  }
  const offenders = ghActionSites(source)
    .filter((site) => site.command.includes(PLACEHOLDER))
    .filter((site) => !RECONCILE_PLACEHOLDER_SITES.some((allowed) => site.command.startsWith(allowed)))
    .map((site) => site.command.trim());
  assert.deepEqual(offenders, [], 'a gh command may only carry the <OWNER_REPO> placeholder at a whitelisted reconcile list site; anywhere else it is an un-substituted placeholder the shell turns into a redirection');
});

test('the derivation primitive gh repo view is not itself in the pr/api/run/issue set (naturally exempt)', () => {
  assert.ok(source.includes('gh repo view --json nameWithOwner'), 'the target-repo slug derivation primitive is present');
  assert.equal([...'gh repo view'.matchAll(GH_ACTION)].length, 0);
});

test('D7: the target repo slug is derived exactly ONCE — no other prompt asks an agent to resolve nameWithOwner', () => {
  const hits = source.split('gh repo view --json nameWithOwner').length - 1;
  assert.equal(hits, 1, `the slug derivation command must appear exactly once (the reconcile probe); found ${hits} occurrences`);
});

test('D7: no emitted command derives the repo slug through a $( ) subshell or a cd-and-chain', () => {
  assert.equal(source.includes('$(cd '), false, 'a cd-subshell makes the emitted command unmatchable by a literal permission allow-rule');
  assert.equal(source.includes('gh repo view --json nameWithOwner -q .nameWithOwner'), false, 'the -q slug read only ever existed inside the removed subshells');
  assert.equal(source.includes('$repoSlug'), false, 'the slug is an engine-resolved literal, never a shell variable');
});

test('MSP-3: every pull-request-CREATION site emits the anchored mitosis-git wrapper, and none of them still hands the agent a free-form open-PR probe', () => {
  const invocations = source.split(PR_TOOL_INVOCATION).length - 1;
  assert.equal(invocations, PR_CREATE_SITES, `all ${PR_CREATE_SITES} PR-creation sites (supersede, ship) must invoke the wrapper; found ${invocations}`);
  assert.equal(source.includes('gh pr list -R ${repoSlug} --head'), false, 'the --head open-PR probe is the observe step the wrapper now owns; emitting it too restores the free-form surface this increment removes');
  assert.equal(source.includes('--body-line'), false, 'the free-form body-line flag is the ad-hoc surface centralized PR creation removes; the engine composes named fields only');
});

test('MSP-3 fold: every pr-create site states the wrapper AMBIGUOUS converge exit instead of a flat nothing-was-opened guarantee', () => {
  const sites = source.split('\n').filter((line) => line.includes(PR_TOOL_INVOCATION));
  assert.equal(sites.length, PR_CREATE_SITES, `expected all ${PR_CREATE_SITES} pr-create instruction lines; found ${sites.length}`);
  for (const site of sites) {
    assert.ok(
      site.includes(`Exit ${MITOSIS_GIT_CONVERGE_EXIT} is AMBIGUOUS`),
      `this pr-create site never names exit ${MITOSIS_GIT_CONVERGE_EXIT}, the one exit whose own stderr says a pull request MAY exist: ${site.trim().slice(0, 160)}`,
    );
    assert.ok(
      site.includes('a pull request MAY exist'),
      `this pr-create site does not carry the wrapper own MAY-exist wording: ${site.trim().slice(0, 160)}`,
    );
    assert.equal(
      /any non-zero exit means (nothing was opened|no pull request was opened)/.test(site),
      false,
      `this pr-create site still asserts a flat non-zero guarantee the wrapper contradicts on exit ${MITOSIS_GIT_CONVERGE_EXIT}: ${site.trim().slice(0, 160)}`,
    );
  }
});

const RECEIPTS_TITLE_LINT = /^(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?!?: [a-z].*[^ .]$/;

function prCreateArgvWithDepends(depends) {
  return [
    'pr-create', '--repo', 'acme/widgets', '--head', 'mitosis/msp-1-integration', '--base', 'main',
    '--title', 'refactor(pr-tool): centralize pull-request creation',
    '--origin', 'machine', '--provenance', 'agent=ship:msp-1 model=opus',
    '--why', 'the engine composes every value as an engine-resolved literal.',
    '--what', 'centralize pull-request creation',
    '--not-verified', 'CI on the fresh head and base - not run',
    '--depends', depends,
  ];
}

function engineConst(name) {
  const match = source.match(new RegExp(`^const ${name} = (.*);$`, 'm'));
  assert.ok(match, `the engine declares ${name}`);
  return match[1];
}

function engineFn(name, params) {
  const match = source.match(new RegExp(`^function ${name}\\(${params}\\) \\{\\n(?:.*\\n)*?\\}$`, 'm'));
  assert.ok(match, `the engine declares ${name}`);
  return match[0];
}

function engineExports() {
  const decls = ['PR_TITLE_PATTERN', 'PR_VALUE_LEAD', 'PR_VALUE_TAG', 'PR_VALUE_SHELL', 'PR_VALUE_ASCII', 'PR_VALUE_RESERVED_FIELD', 'PR_VALUE_RESERVED_STRUCTURE', 'PR_VALUE_CAP']
    .map((name) => `const ${name} = ${engineConst(name)};`)
    .join('\n');
  const dependsDecls = ['PR_DEPENDS_MAX_IDS', 'PR_DEPENDS_MAX_ID_LEN', 'PR_DEPENDS_ID_PATTERN', 'PR_DEPENDS_LINE_BUDGET']
    .map((name) => `const ${name} = ${engineConst(name)};`)
    .join('\n');
  const fns = [engineFn('prBodyValueOk', 'value'), engineFn('prTitleFor', 'msp'), engineFn('prDependsFlag', 'dependsOn')].join('\n');
  return new Function(`${decls}\n${dependsDecls}\n${fns}\nreturn { prBodyValueOk, prTitleFor, prDependsFlag };`)();
}

test('every pr-create site — supersede and ship — emits every flag the tool requires and none it removed', () => {
  const sites = source.split('\n').filter((line) => line.includes(PR_TOOL_INVOCATION));
  assert.equal(sites.length, PR_CREATE_SITES);
  for (const site of sites) {
    const invocation = site.slice(site.indexOf(PR_TOOL_INVOCATION));
    for (const flag of FLAG_SPEC['pr-create'].required) {
      assert.ok(invocation.includes(`${flag} `), `this pr-create site omits the required flag ${flag}, so every pull request it opens is a usage rejection: ${site.trim().slice(0, 160)}`);
    }
    assert.ok(invocation.includes('--origin machine --provenance '), 'a machine-opened pull request must name the agent and model that opened it');
    assert.ok(invocation.includes('--not-verified '), 'the pull request opens before CI starts, so each site states the CI it has NOT run rather than predicting a green run');
    assert.equal(invocation.includes('--verified '), false, 'no engine site may claim a check it did not run');
    assert.equal(invocation.includes('--body-line'), false, 'the removed free-form line flag would restore the ad-hoc surface');
    assert.equal(invocation.includes('--review-order'), false, 'the cut review-order flag is an unknown flag the parser rejects');
  }
});

test('drift guard: the engine PR_TITLE_PATTERN literal is identical to the tool export it cannot import', () => {
  assert.equal(engineConst('PR_TITLE_PATTERN'), PR_TITLE_PATTERN.toString(), 'mitosis.js is evaluated as a function body and cannot import ESM, so the title grammar is necessarily duplicated — the two literals must stay byte-identical');
  assert.equal(engineConst('PR_VALUE_CAP'), String(PR_VALUE_CAP), 'the engine value cap must equal the tool value cap, or the engine accepts a value the tool rejects');
});

test('drift guard: the engine never accepts a body value the tool sanitizer rejects', () => {
  const { prBodyValueOk } = engineExports();
  const fixtures = [
    'Four of the five paths that open a pull request invent the title and body ad hoc.',
    'compose pr bodies from declared fields',
    '(a parenthetical lead is an accepted value)',
    'a value with a - hyphen and a / slash and a : colon',
    '```',
    '# forged heading',
    '## Verification',
    '> block quote',
    '| table | row |',
    '~~~',
    '@/etc/passwd',
    '<details>',
    '<!-- comment opener',
    '===',
    '---',
    'café non-ascii',
    'trojan ‮source',
    'ship $(id) escape',
    'ship `whoami` escape',
    'ship back\\slash escape',
    'Verified: every suite passed',
    'not verified: nothing - all of it ran',
    'SUPERSEDES https://github.com/acme/widgets/pull/1',
    'DEPENDS-ON msp-1',
    'SIZE: this diff changes about 3 lines',
    '',
    'x'.repeat(PR_VALUE_CAP + 1),
  ];
  for (const value of fixtures) {
    if (!prBodyValueOk(value)) continue;
    assert.notEqual(
      inertValue(value, PR_VALUE_CAP),
      null,
      `the engine accepted a value the tool rejects, so this MSP would die at pr-create after every implementation stage: ${JSON.stringify(value)}`,
    );
  }
});

test('drift guard: the engine additionally refuses shell-active body values, because it interpolates them into a command an agent runs verbatim', () => {
  const { prBodyValueOk } = engineExports();
  for (const value of ['ship $(id) escape', 'ship `whoami` escape', 'ship back\\slash escape']) {
    assert.equal(prBodyValueOk(value), false, `an MSP field carrying live shell syntax must halt the run at decomposition, never reach an emitted command: ${JSON.stringify(value)}`);
  }
});

test('drift guard: the engine refuses a body value that opens with a line prefix the tool owns, so no MSP field can forge a verification statement', () => {
  const { prBodyValueOk } = engineExports();
  for (const value of ['Verified: every suite passed', 'not verified: nothing - all of it ran', 'SIZE: this diff changes about 3 lines', 'SUPERSEDES https://github.com/acme/widgets/pull/1', 'DEPENDS-ON msp-1']) {
    assert.equal(prBodyValueOk(value), false, `a value opening with a tool-owned line prefix must be refused at decomposition: ${JSON.stringify(value)}`);
  }
  assert.equal(prBodyValueOk('Verification of the parser is covered by the unit suite'), true, 'ordinary prose that merely mentions verification stays acceptable');
});

test('drift guard: the engine omits a --depends flag the tool would reject rather than emitting one that fails at pr-create', () => {
  const { prDependsFlag } = engineExports();
  const narrow = ['msp-1', 'msp-2'];
  assert.equal(prDependsFlag(narrow), ' --depends "msp-1,msp-2"');
  assert.equal(parseMitosisGitArgv(prCreateArgvWithDepends(narrow.join(','))).ok, true);
  const wide = Array.from({ length: 64 }, (_, i) => `d${String(i).padStart(2, '0')}${'x'.repeat(61)}`);
  assert.equal(prDependsFlag(wide), '', 'a depends set that cannot compose an inert link line is dropped, never emitted for the tool to reject at ship time');
});

test('the receipts PR-title lint this repo deploys is the literal the engine title fixtures are checked against', () => {
  const deployed = readFileSync(new URL('../../../skills/mitosis/templates/receipts.yml', import.meta.url), 'utf8');
  assert.ok(
    deployed.includes(`grep -Eq '${RECEIPTS_TITLE_LINT.source}'`),
    'the deployed receipts.yml title lint must be the exact regex these tests assert composed titles against, or the CI backstop and the tool grammar drift apart silently',
  );
  assert.match(deployed, /types: \[opened, edited, reopened, synchronize\]/, 'a title edited after opening must re-run the lint that is claimed to backstop it');
});

test('every title the engine composes from a declared MSP passes the receipts.yml Conventional-Commits PR-title lint the engine deploys to target repos', () => {
  const { prTitleFor } = engineExports();
  const fixtures = [
    { changeType: 'refactor', scope: 'pr-tool', title: 'centralize pull-request creation' },
    { changeType: 'fix', scope: 'hooks', title: 'deny raw pr creation at the gate' },
    { changeType: 'docs', scope: 'rules', title: 'point the PR rule at the central tool' },
    { changeType: 'chore', scope: 'a', title: 'ab' },
    { changeType: 'refactor', scope: 'abcdefghijklmnop', title: 'x'.repeat(40).replace(/^x/, 'a') },
  ];
  for (const msp of fixtures) {
    const title = prTitleFor(msp);
    assert.ok(title !== null, `the engine must compose a title for ${JSON.stringify(msp)}`);
    assert.ok(title.length <= 72, `the composed title is the squash commit subject and the deployed lint caps it at 72: ${title}`);
    assert.match(title, RECEIPTS_TITLE_LINT, `the composed title fails the lint the engine itself deploys — the defect the removed "mitosis: " prefix had: ${title}`);
  }
  assert.equal(RECEIPTS_TITLE_LINT.test('mitosis: solo'), false, 'the removed prefix is exactly what that deployed lint rejects');
});

test('MSP-3: the wrapper anchor resolves to one absolute literal a string-matching permission rule can pin, never a tilde', () => {
  assert.ok(source.includes(`const ${LIB_DIR_NAME} = '${LIB_DIR_LITERAL}';`), 'the emitted anchor is the absolute mitosis path');
  assert.ok(source.includes(`const ${GIT_LIB_DIR_NAME} = '${GIT_LIB_DIR_LITERAL}';`), 'the pull-request tool anchor is the absolute lib/git path, so a string-matching permission rule can pin it');
  assert.equal(source.includes('~/.claude'), false, 'no emitted command may spell the anchor with a tilde: the permission matcher compares strings, not inodes');
});
