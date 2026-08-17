const MODULE = 'decompose-schema';

const SUPPORTED_KEYWORDS = Object.freeze([
  'type',
  'required',
  'additionalProperties',
  'properties',
  'items',
  'minItems',
  'enum',
  'pattern',
]);

export class DecomposeSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecomposeSchemaError';
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

export const DECOMPOSE_SCHEMA = deepFreeze({
  type: 'object',
  required: ['msps'],
  additionalProperties: false,
  properties: {
    msps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'rationale', 'changeType', 'scope', 'dependsOn', 'fileScope'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,29}$' },
          title: { type: 'string', pattern: '^[a-z][\\x20-\\x7E]{0,38}[\\x21-\\x2D\\x2F-\\x7E]$' },
          rationale: { type: 'string', pattern: '^[A-Za-z0-9(][\\x20-\\x7E]{0,198}[\\x21-\\x7E]$' },
          changeType: { type: 'string', enum: ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci'] },
          scope: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,15}$' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          fileScope: {
            type: 'object',
            required: ['edit', 'read', 'truncated'],
            additionalProperties: false,
            properties: {
              edit: { type: 'array', items: { type: 'string' } },
              read: { type: 'array', items: { type: 'string' } },
              truncated: { type: ['object', 'null'] },
            },
          },
        },
      },
    },
  },
});

export const DECOMPOSE_CHANGE_TYPES = DECOMPOSE_SCHEMA.properties.msps.items.properties.changeType.enum;

export const UNIT_VERDICT_SCHEMA = deepFreeze({
  type: 'object',
  required: ['sha'],
  additionalProperties: false,
  properties: {
    sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
  },
});

export const SCHEMA_PATTERN_LITERALS = deepFreeze([
  /^[a-z0-9][a-z0-9-]{0,29}$/,
  /^[a-z][\x20-\x7E]{0,38}[\x21-\x2D\x2F-\x7E]$/,
  /^[A-Za-z0-9(][\x20-\x7E]{0,198}[\x21-\x7E]$/,
  /^[a-z0-9][a-z0-9-]{0,15}$/,
  /^[0-9a-f]{40}$/,
]);

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function declaredKinds(node) {
  return Array.isArray(node.type) ? node.type : [node.type];
}

function requireSupportedKeywords(node, path) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new DecomposeSchemaError(`${MODULE}: the schema node at ${path} is not an object, so nothing about the value there can be enforced`);
  }
  const unsupported = Object.keys(node).filter((keyword) => !SUPPORTED_KEYWORDS.includes(keyword));
  if (unsupported.length > 0) {
    throw new DecomposeSchemaError(`${MODULE}: the schema node at ${path} declares ${unsupported.join(', ')}, which this validator does not enforce; the child is handed the whole schema, so a keyword enforced there and ignored here would let a decomposition through unchecked`);
  }
}

function checkEnum(node, value, path, failures) {
  if (node.enum === undefined || node.enum.includes(value)) return;
  failures.push(`${path} is ${JSON.stringify(value)}, which is not one of ${node.enum.join(', ')}`);
}

function patternLiteralFor(node, path) {
  if (node.pattern === undefined) return undefined;
  const literal = SCHEMA_PATTERN_LITERALS.find((candidate) => candidate.source === node.pattern);
  if (literal === undefined) {
    throw new DecomposeSchemaError(`${MODULE}: the schema node at ${path} declares the pattern ${node.pattern}, which this validator holds no literal for; compiling a pattern out of schema text would build a regular expression from a variable, so this validator enforces only the patterns it ships as literals and refuses to pretend it checked the rest`);
  }
  return literal;
}

function checkPattern(literal, pattern, value, path, failures) {
  if (literal === undefined || literal.test(value)) return;
  failures.push(`${path} is ${JSON.stringify(value)}, which does not match ${pattern}`);
}

function checkArray(node, value, path, failures) {
  if (node.minItems !== undefined && value.length < node.minItems) {
    failures.push(`${path} carries ${value.length} entries, fewer than the ${node.minItems} the schema requires`);
  }
  if (node.items === undefined) return;
  value.forEach((entry, index) => checkNode(node.items, entry, `${path}[${index}]`, failures));
}

function checkRequiredKeys(node, value, path, failures) {
  for (const key of node.required === undefined ? [] : node.required) {
    if (Object.hasOwn(value, key)) continue;
    failures.push(`${path} omits the required key ${JSON.stringify(key)}`);
  }
}

function checkAdditionalKeys(node, value, path, failures) {
  if (node.additionalProperties !== false) return;
  const allowed = node.properties === undefined ? {} : node.properties;
  for (const key of Object.keys(value)) {
    if (Object.hasOwn(allowed, key)) continue;
    failures.push(`${path} declares ${JSON.stringify(key)}, which the schema does not allow`);
  }
}

function checkObject(node, value, path, failures) {
  checkRequiredKeys(node, value, path, failures);
  checkAdditionalKeys(node, value, path, failures);
  const properties = node.properties === undefined ? {} : node.properties;
  for (const [key, child] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key)) continue;
    checkNode(child, value[key], `${path}.${key}`, failures);
  }
}

function checkNode(node, value, path, failures) {
  requireSupportedKeywords(node, path);
  const literal = patternLiteralFor(node, path);
  const kind = kindOf(value);
  if (!declaredKinds(node).includes(kind)) {
    failures.push(`${path} is ${kind} rather than ${declaredKinds(node).join(' or ')}`);
    return;
  }
  checkEnum(node, value, path, failures);
  if (kind === 'string') checkPattern(literal, node.pattern, value, path, failures);
  if (kind === 'array') checkArray(node, value, path, failures);
  if (kind === 'object') checkObject(node, value, path, failures);
}

export function validateAgainstSchema(schema, value, label) {
  const failures = [];
  checkNode(schema, value, label, failures);
  if (failures.length > 0) {
    return Object.freeze({ ok: false, failures: Object.freeze(failures), decomposition: null });
  }
  return Object.freeze({ ok: true, failures: Object.freeze([]), decomposition: value });
}

export function validateDecomposition(value) {
  return validateAgainstSchema(DECOMPOSE_SCHEMA, value, 'the decomposition');
}
