export const PROGRESS_ORDER = Object.freeze(['planned', 'built', 'pr-open', 'merged']);

export const DISPOSITION_CLASSES = Object.freeze(['Transient', 'ApproachFixable', 'Unknown', 'NeedsHuman', 'BlockedByPrereq']);

function assertProgressToken(token) {
  if (!PROGRESS_ORDER.includes(token)) {
    throw new TypeError(`unrecognized progress token: ${JSON.stringify(token)}`);
  }
}

export function mergeProgress(current, incoming) {
  assertProgressToken(current);
  assertProgressToken(incoming);
  const currentRank = PROGRESS_ORDER.indexOf(current);
  const incomingRank = PROGRESS_ORDER.indexOf(incoming);
  return currentRank >= incomingRank ? current : incoming;
}

export function legacyProgress(token) {
  if (token === 'shipped') {
    return 'pr-open';
  }
  if (PROGRESS_ORDER.includes(token)) {
    return token;
  }
  throw new TypeError(`unrecognized legacy progress token: ${JSON.stringify(token)}`);
}

export function createDisposition({ class: dispositionClass, diagnosis, stage, resumePoint, triedSet, remediation }) {
  if (!DISPOSITION_CLASSES.includes(dispositionClass)) {
    throw new TypeError(`unrecognized disposition class: ${JSON.stringify(dispositionClass)}`);
  }
  return Object.freeze({
    class: dispositionClass,
    diagnosis,
    stage,
    resumePoint,
    triedSet: Object.freeze([...triedSet]),
    remediation,
  });
}
