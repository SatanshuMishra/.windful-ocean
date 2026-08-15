function failureText(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function cleanlyRan(result) {
  return result !== null && typeof result === 'object'
    && result.outcome === 'completed'
    && typeof result.status === 'number'
    && typeof result.stdout === 'string'
    && typeof result.stderr === 'string';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectResolvedConfigJson(root, argv, io, side, label) {
  let result;
  try {
    result = io.run('node', argv, { cwd: root });
  } catch (error) {
    return { ok: false, error: `${label} could not be collected on ${side} (${root}): ${failureText(error, 'unknown spawn failure')}` };
  }
  if (!cleanlyRan(result) || result.status !== 0) {
    return {
      ok: false,
      error: `${label} could not be collected on ${side} (${root}): it exited ${JSON.stringify(cleanlyRan(result) ? result.status : null)} rather than 0; its stderr was ${JSON.stringify(result === null || result === undefined ? null : result.stderr)}`,
    };
  }
  try {
    return { ok: true, parsed: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be parsed: it printed text that is not JSON (${failureText(error, 'unknown parse failure')})` };
  }
}

export function collectTsconfigOptions(root, bin, io, side) {
  const label = "tsc's resolved config (--showConfig)";
  const collected = collectResolvedConfigJson(root, [bin, '--showConfig', '--project', root], io, side, label);
  if (!collected.ok) return collected;
  const { parsed } = collected;
  if (!isPlainObject(parsed) || !isPlainObject(parsed.compilerOptions)) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be collected: it printed ${JSON.stringify(parsed)}, which carries no compilerOptions object` };
  }
  return { ok: true, tsconfigOptions: parsed.compilerOptions };
}

export function collectEslintConfig(root, bin, io, files, side) {
  if (files.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be collected on ${side} (${root}): eslint reported zero files, so there is no candidate file to print the config for` };
  }
  const chosen = files[0];
  const label = `eslint's resolved config (--print-config ${chosen})`;
  const collected = collectResolvedConfigJson(root, [bin, '--print-config', chosen], io, side, label);
  if (!collected.ok) return collected;
  const { parsed } = collected;
  if (!isPlainObject(parsed) || !isPlainObject(parsed.rules)) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be collected: it printed ${JSON.stringify(parsed)}, which carries no rules object` };
  }
  return { ok: true, eslintConfig: Object.freeze({ rules: parsed.rules }), eslintConfigFile: chosen };
}
