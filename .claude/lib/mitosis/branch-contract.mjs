export class BranchContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BranchContractError';
  }
}

const PLATFORM_DEFAULTS = new Set(['main', 'master']);

export function resolveBranch(role, opts = {}) {
  const { passed, declared, allowPlatformDefault = false } = opts;
  const pick = passed ?? declared ?? null;
  if (!pick) {
    throw new BranchContractError(
      `${role} branch not declared: pass it explicitly or declare it in machine-readable config; never defaulting to the platform branch`,
    );
  }
  if (PLATFORM_DEFAULTS.has(pick) && !allowPlatformDefault) {
    throw new BranchContractError(
      `${role} branch resolved to the platform default "${pick}"; refusing to target it implicitly — declare an explicit integration branch or set allowPlatformDefault`,
    );
  }
  return pick;
}
