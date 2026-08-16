import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../secret-scanner.sh', import.meta.url));

const filler = (n) => 'A'.repeat(n);

const fixtures = {
  anthropic: 'sk-' + 'ant-api03-' + filler(44),
  openaiProject: 'sk-' + 'proj-' + filler(40),
  openaiLegacy: 'sk-' + filler(32),
  githubFineGrained: 'github_' + 'pat_' + filler(60),
  githubPat: 'ghp_' + filler(36),
  githubOauth: 'gho_' + filler(36),
  githubServer: 'ghs_' + filler(36),
  slackBot: 'xoxb-' + filler(40),
  slackUser: 'xoxp-' + filler(40),
  awsKey: 'AKIA' + filler(16),
  googleApi: 'AIza' + filler(35),
  jwtLike: 'eyJhbGciOi' + filler(50),
  npmToken: 'npm_' + filler(36),
  stripeSecret: 'sk_' + 'live_' + filler(24),
  privateKey: '-----BEGIN ' + 'PRIVATE KEY-----',
  rsaPrivateKey: '-----BEGIN ' + 'RSA ' + 'PRIVATE KEY-----',
};

function runHook(payload) {
  return spawnSync(hookPath, [], { input: JSON.stringify(payload), encoding: 'utf8' });
}

function scanContent(content) {
  return runHook({ tool_input: { content } });
}

function assertBlocked(result, patternName) {
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED/);
  assert.match(result.stderr, new RegExp(patternName));
}

test('blocks an Anthropic api key in content', () => {
  assertBlocked(scanContent(fixtures.anthropic), 'anthropic_key');
});

test('blocks an Anthropic api key embedded in surrounding source', () => {
  const content = `const client = new Anthropic({ apiKey: "${fixtures.anthropic}" });`;
  assertBlocked(scanContent(content), 'anthropic_key');
});

test('blocks an Anthropic api key arriving through new_string', () => {
  assertBlocked(runHook({ tool_input: { new_string: fixtures.anthropic } }), 'anthropic_key');
});

test('blocks an Anthropic api key arriving through file_text', () => {
  assertBlocked(runHook({ tool_input: { file_text: fixtures.anthropic } }), 'anthropic_key');
});

test('blocks an OpenAI project-scoped key', () => {
  assertBlocked(scanContent(fixtures.openaiProject), 'openai_project_key');
});

test('blocks a GitHub fine-grained personal access token', () => {
  assertBlocked(scanContent(fixtures.githubFineGrained), 'github_fine_grained');
});

test('blocks a Slack user token', () => {
  assertBlocked(scanContent(fixtures.slackUser), 'slack_user');
});

test('blocks an npm access token', () => {
  assertBlocked(scanContent(fixtures.npmToken), 'npm_token');
});

test('blocks a Stripe live secret key', () => {
  assertBlocked(scanContent(fixtures.stripeSecret), 'stripe_secret');
});

test('blocks a legacy OpenAI key', () => {
  assertBlocked(scanContent(fixtures.openaiLegacy), 'openai_key');
});

test('blocks a GitHub classic personal access token', () => {
  assertBlocked(scanContent(fixtures.githubPat), 'github_pat');
});

test('blocks a GitHub oauth token', () => {
  assertBlocked(scanContent(fixtures.githubOauth), 'github_oauth');
});

test('blocks a GitHub server token', () => {
  assertBlocked(scanContent(fixtures.githubServer), 'github_server');
});

test('blocks a Slack bot token', () => {
  assertBlocked(scanContent(fixtures.slackBot), 'slack_bot');
});

test('blocks an AWS access key id', () => {
  assertBlocked(scanContent(fixtures.awsKey), 'aws_key');
});

test('blocks a Google api key', () => {
  assertBlocked(scanContent(fixtures.googleApi), 'google_api');
});

test('blocks a jwt-shaped token', () => {
  assertBlocked(scanContent(fixtures.jwtLike), 'jwt_like');
});

test('blocks a pem private key header', () => {
  assertBlocked(scanContent(fixtures.privateKey), 'private_key');
});

test('blocks an rsa pem private key header', () => {
  assertBlocked(scanContent(fixtures.rsaPrivateKey), 'private_key');
});

test('allows ordinary source content', () => {
  const content = 'export function add(a, b) {\n  return a + b;\n}\n';
  const r = scanContent(content);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('allows prose that names the key formats without carrying one', () => {
  const content = 'Read the key from ANTHROPIC_API_KEY; never inline an sk-ant value.';
  assert.equal(scanContent(content).status, 0);
});

test('allows a short redacted placeholder', () => {
  const content = 'const apiKey = "sk-' + 'ant-api03-xxxxx"';
  assert.equal(scanContent(content).status, 0);
});

test('allows an env var reference to an api key', () => {
  const content = 'const apiKey = process.env.ANTHROPIC_API_KEY;';
  assert.equal(scanContent(content).status, 0);
});

test('allows a payload carrying no scannable field', () => {
  assert.equal(runHook({ tool_input: { command: 'git status' } }).status, 0);
});

test('allows an empty tool_input', () => {
  assert.equal(runHook({ tool_input: {} }).status, 0);
});
