---
Status: accepted
Date: 2026-08-24T20:01:25.790Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0719. agent-generate self-executes at import, so U2.1 ships one acceptance clause unmet

## Context

U2.1's acceptance criterion requires that every module under src imports individually with exit 0. Five of the six carried modules do. agent-generate.mjs does not: at the import SHA ea5cd118 the host file ends with a top-level await runAgentGenerate(process.argv.slice(2)) followed by process.exit(result.code), with no main guard. Importing the module is therefore running its command-line program, in the host exactly as in the extracted repository, and with no agent-specs directory present in the flat layout it exits 2. The implementer reproduced this under an isolated HOME to rule out the machine's live configuration, and declined to add a guard because that would break the byte-identity the unit is built on. This is also why the module was missed by U2's import closure in the first place: it is reachable only as a spawned driver.

## Options

- Add a main guard to agent-generate.mjs so it imports cleanly, breaking byte-identity with the host
- Carry the agent-specs data directory so the import-time run succeeds, which still needs the flat-layout path change
- Ship the clause unmet, state the cause in the pull request body, and file the guard as its own item

## Outcome

Ship with the clause unmet and state it plainly rather than force a green. Neither remedy is available inside this unit: a main guard is a behaviour change to a file whose byte-identity is the unit's own receipt, and carrying the agent-specs directory does not help while the module resolves it through segments the flat layout does not have. The pull request body records the module as not verified with the reason, never as verified. The guard is filed as a new item above this unit's ceiling; U3 is the natural carrier because it already opens the same file for the homedir signature change, but that placement is a recommendation for the plan owner, not a plan edit made here.
