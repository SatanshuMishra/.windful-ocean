import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join, relative, sep } from 'node:path';
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
const SHELL_EXTENSIONS = Object.freeze(['.sh', '.bash']);
const EXECUTABLE_BITS = 0o111;

const failure = (rule, detail) => Object.freeze({ rule, detail });

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
      (matcher?.hooks ?? [])
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

export function syntaxCheckFor(target) {
  const extension = extname(target);
  if (NODE_EXTENSIONS.includes(extension)) return { command: 'node', args: ['--check', target] };
  if (SHELL_EXTENSIONS.includes(extension)) return { command: 'bash', args: ['-n', target] };
  return null;
}

function hookFailuresFor(registration, context) {
  const { rawPath, interpreter, command } = registration;
  const { resolved, where } = mapIntoCandidate({ ...context, rawPath });
  if (resolved === null) {
    return [failure('hook-resolution', `${command}: path ${JSON.stringify(rawPath)} resolves ${where} the candidate release and ${where === 'outside' ? 'outside local/' : 'nowhere usable'}`)];
  }
  if (!existsSync(resolved)) {
    return [failure('hook-resolution', `${command}: resolves to ${resolved}, which does not exist`)];
  }
  return [...executabilityFailures(resolved, interpreter, command), ...syntaxFailures(resolved, command)];
}

function executabilityFailures(resolved, interpreter, command) {
  if (interpreter !== null) return [];
  const mode = statSync(resolved).mode;
  if ((mode & EXECUTABLE_BITS) !== 0) return [];
  return [failure('hook-executable', `${command}: ${resolved} is invoked bare but is not executable`)];
}

function syntaxFailures(resolved, command) {
  const check = syntaxCheckFor(resolved);
  if (check === null) return [];
  const run = spawnSync(check.command, check.args, { encoding: 'utf8' });
  if (run.error) {
    return [failure('hook-syntax', `${command}: ${check.command} could not be run: ${run.error.message}`)];
  }
  if (run.status === 0) return [];
  const reason = (run.stderr || run.stdout || '').trim().split('\n')[0] ?? `exit ${run.status}`;
  return [failure('hook-syntax', `${command}: ${check.command} ${check.args[0]} failed: ${reason}`)];
}

export function hookFailures({ settings, configRoot, candidateDir, home }) {
  return hookRegistrations(settings).flatMap((registration) =>
    hookFailuresFor(registration, { configRoot, candidateDir, home }),
  );
}

function jsonFilesUnder(root) {
  try {
    return readdirSync(root, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  } catch {
    return [];
  }
}

export function jsonParseFailures(candidateDir) {
  return jsonFilesUnder(candidateDir).flatMap((file) => {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
      return [];
    } catch (error) {
      return [failure('json-parse', `${relative(candidateDir, file)}: ${error.message}`)];
    }
  });
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
