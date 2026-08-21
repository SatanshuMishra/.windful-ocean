const MODULE = 'pr-work-type';
const WORK_TYPE_LINE_PREFIX = 'work-type: ';
const NO_LINE = Symbol('pr-work-type-no-line');

const WORK_TYPE_BY_CHANGE_TYPE = Object.freeze({
  feat: 'feature',
  fix: NO_LINE,
  refactor: 'refactor',
  docs: NO_LINE,
  test: NO_LINE,
  chore: 'chore',
  perf: NO_LINE,
  ci: NO_LINE,
});

export const PR_WORK_TYPE_CHANGE_TYPES = Object.freeze(Object.keys(WORK_TYPE_BY_CHANGE_TYPE));

export function workTypeLineFor(changeType) {
  if (typeof changeType !== 'string' || !Object.hasOwn(WORK_TYPE_BY_CHANGE_TYPE, changeType)) {
    throw new TypeError(`${MODULE}: refuses to compose a pull-request work-type line for the change type ${JSON.stringify(changeType)}, because only ${PR_WORK_TYPE_CHANGE_TYPES.join(', ')} are declared conventional-commit types and a silently omitted line here is the exact defect this module closes`);
  }
  const mapped = WORK_TYPE_BY_CHANGE_TYPE[changeType];
  return mapped === NO_LINE ? null : `${WORK_TYPE_LINE_PREFIX}${mapped}`;
}
