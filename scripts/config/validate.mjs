import {
  closeSync,
  constants,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  readlinkSync,
  rmSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, extname, join, relative, sep } from 'node:path';
import {
  CURRENT_LINK,
  INTERPRETERS,
  PROMOTED_ENTRIES,
  expandHome,
  isInside,
  localDir,
  realpathOrNull,
  releasesDir,
} from './paths.mjs';

const NODE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs']);
const BASH_EXTENSIONS = Object.freeze(['.sh', '.bash']);
const ZSH_EXTENSIONS = Object.freeze(['.zsh']);
const PYTHON_EXTENSIONS = Object.freeze(['.py']);
const NODE_LANGUAGES = Object.freeze(['node', 'nodejs']);
const PYTHON_LANGUAGES = Object.freeze(['python', 'python3']);
const SHELL_LANGUAGES = Object.freeze(['bash', 'sh', 'zsh']);
const SHEBANG_PREFIX = '#!';
const SHEBANG_READ_BYTES = 512;
const PYTHON_PARSE_PROGRAM = [
  'import ast, sys',
  'try:',
  '    handle = open(sys.argv[1], "rb")',
  '    source = handle.read()',
  '    handle.close()',
  '    ast.parse(source, sys.argv[1])',
  'except (SyntaxError, ValueError, OSError) as error:',
  '    sys.stderr.write(str(error) + "\\n")',
  '    sys.exit(1)',
].join('\n');
const LANGUAGE_CHECKERS = Object.freeze([
  Object.freeze({ language: 'node', command: 'node', flags: Object.freeze(['--check']) }),
  Object.freeze({ language: 'python', command: 'python3', flags: Object.freeze(['-I', '-c', PYTHON_PARSE_PROGRAM]) }),
  Object.freeze({ language: 'bash', command: 'bash', flags: Object.freeze(['-n']) }),
  Object.freeze({ language: 'sh', command: 'sh', flags: Object.freeze(['-n']) }),
  Object.freeze({ language: 'zsh', command: 'zsh', flags: Object.freeze(['-f', '-n']) }),
]);
const CHECKER_COMMANDS = Object.freeze(['node', 'python3', 'bash', 'sh', 'zsh']);
const CHECKER_TIMEOUT_MS = 15000;
const CHECKER_MAX_BUFFER = 262144;
const CHECKER_SANDBOX_PREFIX = 'config-syntax-check-';
const JSON_EXTENSION = '.json';
const JSON_POSITION = /at position \d+(?: \(line \d+ column \d+\))?/;
const INERT_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const EXECUTABLE_BITS = 0o111;
const REASON_CAP = 200;
export const DETAIL_CAP = 1000;
export const TRUNCATION_MARK = ' [truncated]';
const { O_NONBLOCK, O_RDONLY } = constants;

function capped(text, cap) {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap - TRUNCATION_MARK.length).trimEnd()}${TRUNCATION_MARK}`;
}

export function inertDetail(detail) {
  const inert = String(detail)
    .replace(INERT_CHARACTERS, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return capped(inert, DETAIL_CAP);
}

const failure = (rule, detail) => Object.freeze({ rule, detail: inertDetail(detail) });

export function expectedEntries(configRoot) {
  const discovered = (() => {
    try {
      return readdirSync(configRoot, { withFileTypes: true })
        .filter((entry) => entry.isSymbolicLink())
        .filter((entry) => {
          const target = readlinkOrNull(join(configRoot, entry.name));
          return target !== null && target.split(sep)[0] === CURRENT_LINK;
        })
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  })();
  return [...new Set([...PROMOTED_ENTRIES, ...discovered])].sort();
}

function readlinkOrNull(target) {
  try {
    return readlinkSync(target);
  } catch {
    return null;
  }
}

function isNonEmpty(target) {
  const stats = statSync(target);
  if (stats.isDirectory()) return readdirSync(target).length > 0;
  return stats.size > 0;
}

export function coverageFailures(candidateDir, entries) {
  return entries.flatMap((entry) => {
    const target = join(candidateDir, entry);
    if (!existsSync(target)) {
      return [failure('coverage', `entry ${JSON.stringify(entry)} is absent from the candidate release`)];
    }
    try {
      if (!isNonEmpty(target)) {
        return [failure('coverage', `entry ${JSON.stringify(entry)} is present but empty in the candidate release`)];
      }
    } catch (error) {
      return [failure('coverage', `entry ${JSON.stringify(entry)} could not be inspected: ${error.message}`)];
    }
    return [];
  });
}

export function hookRegistrations(settings) {
  if (settings === null || typeof settings !== 'object') return [];
  const groups = Object.values(settings.hooks ?? {}).filter(Array.isArray);
  return groups.flatMap((group) =>
    group.flatMap((matcher) =>
      (Array.isArray(matcher?.hooks) ? matcher.hooks : [])
        .filter((hook) => typeof hook?.command === 'string' && hook.command.trim() !== '')
        .map((hook) => parseHookCommand(hook.command)),
    ),
  );
}

export function parseHookCommand(command) {
  const tokens = command.trim().split(/\s+/);
  const hasInterpreter = INTERPRETERS.includes(tokens[0]);
  return Object.freeze({
    command,
    interpreter: hasInterpreter ? tokens[0] : null,
    rawPath: hasInterpreter ? (tokens[1] ?? '') : tokens[0],
  });
}

export function mapIntoCandidate({ rawPath, configRoot, candidateDir, home }) {
  const expanded = expandHome(rawPath, home);
  if (expanded === '') return { resolved: null, where: 'unparsable' };
  if (isInside(localDir(configRoot), expanded)) return { resolved: expanded, where: 'local' };
  if (!isInside(configRoot, expanded)) return { resolved: null, where: 'outside' };
  const segments = relative(configRoot, expanded).split(sep).filter((part) => part !== '');
  const withoutPointer = segments[0] === CURRENT_LINK ? segments.slice(1) : segments;
  if (withoutPointer.length === 0) return { resolved: null, where: 'unparsable' };
  return { resolved: join(candidateDir, ...withoutPointer), where: 'candidate' };
}

export function firstLineOf(target) {
  try {
    const handle = openSync(target, O_RDONLY | O_NONBLOCK);
    try {
      const buffer = Buffer.alloc(SHEBANG_READ_BYTES);
      const read = readSync(handle, buffer, 0, SHEBANG_READ_BYTES, 0);
      return { ok: true, line: buffer.subarray(0, read).toString('utf8').split('\n')[0] };
    } finally {
      closeSync(handle);
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function canonicalLanguage(name) {
  if (typeof name !== 'string' || name === '') return null;
  if (NODE_LANGUAGES.includes(name)) return 'node';
  if (PYTHON_LANGUAGES.includes(name)) return 'python';
  if (SHELL_LANGUAGES.includes(name)) return name;
  return null;
}

function extensionLanguage(extension) {
  if (NODE_EXTENSIONS.includes(extension)) return 'node';
  if (BASH_EXTENSIONS.includes(extension)) return 'bash';
  if (ZSH_EXTENSIONS.includes(extension)) return 'zsh';
  if (PYTHON_EXTENSIONS.includes(extension)) return 'python';
  return null;
}

function declaredByCommand(interpreter) {
  if (interpreter === null || interpreter === undefined) return null;
  const language = canonicalLanguage(basename(interpreter));
  if (language !== null) return { ok: true, language };
  return {
    ok: false,
    reason: `its command names interpreter ${JSON.stringify(interpreter)}, which this validator cannot syntax-check`,
  };
}

export function shebangLanguage(line) {
  return line
    .slice(SHEBANG_PREFIX.length)
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '')
    .map((token) => canonicalLanguage(basename(token)))
    .find((language) => language !== null) ?? null;
}

function declaredByShebang(target) {
  const read = firstLineOf(target);
  if (!read.ok) return { ok: false, reason: `its first line could not be read: ${read.error}` };
  if (!read.line.startsWith(SHEBANG_PREFIX)) return null;
  const language = shebangLanguage(read.line);
  if (language !== null) return { ok: true, language };
  return {
    ok: false,
    reason: `its shebang ${JSON.stringify(read.line.trim())} names no interpreter this validator can syntax-check`,
  };
}

function declaredByExtension(target) {
  const extension = extname(target);
  const language = extensionLanguage(extension);
  if (language !== null) return { ok: true, language };
  const carried = extension === '' ? 'it has no file extension' : `its extension ${JSON.stringify(extension)} names no language`;
  return { ok: false, reason: `its command names no interpreter, it carries no shebang, and ${carried}` };
}

export function resolveChecker(target, interpreter = null) {
  const declared = declaredByCommand(interpreter) ?? declaredByShebang(target) ?? declaredByExtension(target);
  if (!declared.ok) return declared;
  const checker = LANGUAGE_CHECKERS.find((entry) => entry.language === declared.language);
  if (checker === undefined) {
    return { ok: false, reason: `language ${JSON.stringify(declared.language)} has no syntax checker` };
  }
  return { ok: true, language: checker.language, command: checker.command, args: [...checker.flags, target] };
}

function statOrNull(target) {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function describeKind(stats) {
  if (stats.isDirectory()) return 'a directory';
  if (stats.isFIFO()) return 'a named pipe';
  if (stats.isSocket()) return 'a socket';
  if (stats.isCharacterDevice()) return 'a character device';
  if (stats.isBlockDevice()) return 'a block device';
  return 'of an unrecognized kind';
}

function containmentFailures(real, resolved, command, { candidateDir, configRoot }) {
  const roots = [candidateDir, localDir(configRoot)].map(realpathOrNull).filter((root) => root !== null);
  if (roots.some((root) => isInside(root, real))) return [];
  return [failure(
    'hook-containment',
    `${command}: ${resolved} resolves to ${real}, outside both the candidate release and local/; `
      + 'validation inspects only what the release itself carries',
  )];
}

function shapeFailures(stats, real, command) {
  if (stats === null) return [failure('hook-shape', `${command}: ${real} could not be inspected`)];
  if (stats.isFile()) return [];
  return [failure(
    'hook-shape',
    `${command}: ${real} is not a regular file, it is ${describeKind(stats)}; validation neither reads nor runs it`,
  )];
}

function checkedHookFailures(real, stats, registration, context) {
  const { interpreter, command } = registration;
  return [
    ...executabilityFailures(stats, real, interpreter, command),
    ...syntaxFailures(real, interpreter, command, context.sandboxDir),
  ];
}

function hookFailuresFor(registration, context) {
  const { rawPath, command } = registration;
  const { resolved, where } = mapIntoCandidate({ ...context, rawPath });
  if (resolved === null) {
    return [failure('hook-resolution', `${command}: path ${JSON.stringify(rawPath)} resolves ${where} the candidate release and ${where === 'outside' ? 'outside local/' : 'nowhere usable'}`)];
  }
  const real = realpathOrNull(resolved);
  if (real === null) {
    return [failure('hook-resolution', `${command}: resolves to ${resolved}, which does not exist or does not lead to a real path`)];
  }
  const escaped = containmentFailures(real, resolved, command, context);
  if (escaped.length > 0) return escaped;
  const stats = statOrNull(real);
  const misshapen = shapeFailures(stats, real, command);
  if (misshapen.length > 0) return misshapen;
  return checkedHookFailures(real, stats, registration, context);
}

function executabilityFailures(stats, real, interpreter, command) {
  if (interpreter !== null) return [];
  if ((stats.mode & EXECUTABLE_BITS) !== 0) return [];
  return [failure('hook-executable', `${command}: ${real} is invoked bare but is not executable`)];
}

export function checkerEnvironment(inherited) {
  const path = inherited.PATH;
  return typeof path === 'string' && path !== '' ? Object.freeze({ PATH: path }) : Object.freeze({});
}

function openSandbox() {
  try {
    return { ok: true, dir: mkdtempSync(join(tmpdir(), CHECKER_SANDBOX_PREFIX)) };
  } catch (error) {
    return { ok: false, error: `a working directory outside the candidate release could not be opened: ${error.message}` };
  }
}

function checkerReason(run) {
  const first = (run.stderr || run.stdout || '').split('\n').find((line) => line.trim() !== '') ?? '';
  const inert = inertDetail(first);
  if (inert === '') return `it exited ${run.status} without saying why`;
  return capped(inert, REASON_CAP);
}

function syntaxFailures(resolved, interpreter, command, sandboxDir) {
  const check = resolveChecker(resolved, interpreter);
  if (!check.ok) {
    return [failure('hook-language', `${command}: ${resolved} cannot be syntax-checked because ${check.reason}`)];
  }
  if (!CHECKER_COMMANDS.includes(check.command)) {
    return [failure(
      'hook-language',
      `${command}: refusing to run ${JSON.stringify(check.command)}; only ${CHECKER_COMMANDS.join(', ')} may check a hook`,
    )];
  }
  const run = spawnSync(check.command, check.args, {
    encoding: 'utf8',
    cwd: sandboxDir,
    env: checkerEnvironment(process.env),
    shell: false,
    timeout: CHECKER_TIMEOUT_MS,
    maxBuffer: CHECKER_MAX_BUFFER,
    windowsHide: true,
  });
  if (run.error) {
    return [failure('hook-syntax', `${command}: ${check.command} could not be run: ${run.error.message}`)];
  }
  if (run.status === 0) return [];
  if (run.status === null) {
    return [failure(
      'hook-syntax',
      `${command}: ${check.command} was killed by ${run.signal ?? 'an unknown signal'} before it could report on ${resolved}`,
    )];
  }
  return [failure(
    'hook-syntax',
    `${command}: ${check.command} rejected ${resolved} as ${check.language}: ${checkerReason(run)}`,
  )];
}

export function hookFailures({ settings, configRoot, candidateDir, home }) {
  const registrations = hookRegistrations(settings);
  if (registrations.length === 0) return [];
  const sandbox = openSandbox();
  if (!sandbox.ok) return [failure('hook-syntax', `no hook could be syntax-checked: ${sandbox.error}`)];
  try {
    return registrations.flatMap((registration) =>
      hookFailuresFor(registration, { configRoot, candidateDir, home, sandboxDir: sandbox.dir }),
    );
  } finally {
    rmSync(sandbox.dir, { recursive: true, force: true });
  }
}

export function errorTag(error) {
  const named = error?.code ?? error?.name ?? 'an unnamed error';
  const position = JSON_POSITION.exec(String(error?.message ?? ''));
  return position === null ? named : `${named} ${position[0]}`;
}

function escapingLinkFailures(path, root) {
  const real = realpathOrNull(path);
  if (real === null || isInside(root, real)) return [];
  return [failure(
    'release-containment',
    `${relative(root, path)} links to ${real}, outside the candidate release; `
      + 'validation neither scans nor reads it',
  )];
}

function scanJsonTree(dir, root) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return {
      files: [],
      failures: [failure('json-parse', `candidate tree at ${dir} could not be scanned for JSON: ${errorTag(error)}`)],
    };
  }
  return entries.reduce((found, entry) => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      return { ...found, failures: [...found.failures, ...escapingLinkFailures(path, root)] };
    }
    if (entry.isDirectory()) {
      const nested = scanJsonTree(path, root);
      return { files: [...found.files, ...nested.files], failures: [...found.failures, ...nested.failures] };
    }
    if (entry.isFile() && entry.name.endsWith(JSON_EXTENSION)) {
      return { ...found, files: [...found.files, path] };
    }
    return found;
  }, { files: [], failures: [] });
}

function jsonFileFailures(file, root) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    return [];
  } catch (error) {
    return [failure('json-parse', `${relative(root, file)}: ${errorTag(error)}`)];
  }
}

export function jsonParseFailures(candidateDir) {
  const root = realpathOrNull(candidateDir) ?? candidateDir;
  const scanned = scanJsonTree(root, root);
  return [...scanned.failures, ...scanned.files.flatMap((file) => jsonFileFailures(file, root))];
}

export function bootstrapFailures({ configRoot, bootstrapPaths }) {
  const releases = releasesDir(configRoot);
  return bootstrapPaths.flatMap((bootstrapPath) => {
    const literal = isInside(releases, bootstrapPath)
      ? [failure('bootstrap-location', `${bootstrapPath} is declared inside ${releases}; the bootstrap must resolve outside every release`)]
      : [];
    const resolved = realpathOrNull(bootstrapPath);
    if (resolved === null) return literal;
    const releasesReal = realpathOrNull(releases);
    const resolvedInside = releasesReal !== null && isInside(releasesReal, resolved);
    if (!resolvedInside) return literal;
    return [
      ...literal,
      failure(
        'bootstrap-location',
        `${bootstrapPath} resolves to ${resolved}, inside a release; a bad release would break the machinery that rolls it back`,
      ),
    ];
  });
}

export function validateCandidate({ configRoot, candidateDir, settings, entries, bootstrapPaths, home }) {
  if (!existsSync(candidateDir)) {
    return { ok: false, failures: [failure('coverage', `candidate release ${candidateDir} does not exist`)] };
  }
  const resolvedEntries = entries ?? expectedEntries(configRoot);
  const failures = [
    ...coverageFailures(candidateDir, resolvedEntries),
    ...hookFailures({ settings, configRoot, candidateDir, home }),
    ...jsonParseFailures(candidateDir),
    ...bootstrapFailures({ configRoot, bootstrapPaths }),
  ];
  return { ok: failures.length === 0, failures };
}

export function driftReport(failures) {
  const grouped = failures.reduce((acc, item) => {
    const existing = acc[item.rule] ?? [];
    return { ...acc, [item.rule]: [...existing, item.detail] };
  }, {});
  const lines = Object.entries(grouped).flatMap(([rule, details]) => [
    `  ${rule} (${details.length}):`,
    ...details.map((detail) => `    - ${detail}`),
  ]);
  return [
    `candidate release REJECTED by ${failures.length} validation failure(s); live stays put`,
    ...lines,
  ].join('\n');
}

export function readSettings(path) {
  try {
    return { ok: true, settings: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: true, settings: {} };
    return { ok: false, error: `settings at ${path} could not be read: ${error.message}` };
  }
}
