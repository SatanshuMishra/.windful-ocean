const CONTEXT_WINDOW = 200000;
const CAP_LINE = 160000;
const TOKENS_PER_DISPATCH = 425;

export function expectedAgents(T) {
  return Math.round(2.6 * T + 2);
}

export function planRoute(input) {
  const {
    T, W, D, S = 0,
    GIT = true, WF = true,
    cleanTree = true,
    exploratory = false,
    consentRecorded = false,
    wallClockOver30m = false,
    topTierSession = false,
  } = input;
  if (!Number.isInteger(T) || T < 1) throw new Error('T must be a positive integer');
  if (!Number.isInteger(W) || W < 1) throw new Error('W must be a positive integer');
  if (D !== 'long' && D !== 'short') throw new Error("D must be 'long' or 'short'");
  if (typeof S !== 'number' || !Number.isFinite(S) || S < 0 || S > 100) throw new Error('S must be a number in [0,100]');

  const N = expectedAgents(T);
  const C0 = Math.round((S / 100) * CONTEXT_WINDOW);
  const lightCap = Math.floor((CAP_LINE - C0) / TOKENS_PER_DISPATCH);
  const wfIsolation = W >= 2 || !cleanTree ? 'worktree' : 'scope-fence';
  const notes = [];

  if (S >= 80) {
    if (WF) {
      notes.push('context at or past 80%: dispatch the ceiling-immune workflow, then recommend handoff immediately');
      return { rule: 2, lane: 'workflow', isolation: wfIsolation, handoff: 'recommend-after-dispatch', N, notes };
    }
    notes.push('context at or past 80% and Workflow unavailable: hand off first, dispatch nothing');
    return { rule: 2, lane: 'none', isolation: null, handoff: 'instead-of-dispatch', N, notes };
  }
  if (!WF) {
    if (W >= 2 || T >= 5) notes.push('Workflow tool unavailable for this shape: state the manual cost and recommend upgrading Claude Code (>= 2.1.154) and restarting first');
    notes.push('lean protocol and per-wave run ledger mandatory');
    return { rule: 1, lane: 'light', isolation: null, handoff: S >= 70 ? 'before-dispatch' : 'none', N, notes };
  }
  if (T === 1) {
    return { rule: 3, lane: 'inline', isolation: null, handoff: 'none', N: expectedAgents(1), notes };
  }
  const forceWorkflow = S >= 70;
  if (!GIT) {
    notes.push('no git repository: sequential waves, lean protocol, per-wave run ledger');
    return { rule: 5, lane: 'light', isolation: null, handoff: forceWorkflow ? 'before-dispatch' : 'none', N, notes };
  }
  if (W >= 2) {
    if (exploratory && W <= 3 && S < 50) {
      notes.push('exploratory exception taken: ~1.5 agents of re-read cost per wave');
      return { rule: 6, lane: 'light', isolation: null, handoff: 'none', N, notes };
    }
    return { rule: 6, lane: 'workflow', isolation: 'worktree', handoff: 'none', N, notes };
  }
  if (forceWorkflow) {
    notes.push('context at or past 70%: workflow taken at every choice point');
    return { rule: 4, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  if (D === 'short') {
    if (N <= lightCap) return { rule: 7, lane: 'light', isolation: null, handoff: 'none', N, notes };
    notes.push(`expected agents ${N} exceed the lean dispatch cap ${lightCap}`);
    return { rule: 7, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  if (T === 2 && !((consentRecorded && S >= 50) || wallClockOver30m || topTierSession)) {
    notes.push('immediacy default: light lane at a stated ~1.6-agent re-read premium');
    return { rule: 8, lane: 'light', isolation: null, handoff: 'none', N, notes };
  }
  if (T === 2) {
    return { rule: 8, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
  }
  return { rule: 9, lane: 'workflow', isolation: wfIsolation, handoff: 'none', N, notes };
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    process.stderr.write('usage: route-planner.mjs \'{"T":3,"W":1,"D":"long","S":0,"GIT":true,"WF":true}\'\n');
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(planRoute(JSON.parse(raw)), null, 2) + '\n');
  } catch (e) {
    process.stderr.write('route-planner error: ' + e.message + '\n');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
