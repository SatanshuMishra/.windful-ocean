import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDARY_CENSUS_REFUSAL_KINDS } from '../boundary-census.mjs';
import {
  BOUNDARY_PARITY_ATTESTS,
  BOUNDARY_PARITY_NOT_ATTESTED,
  boundaryParityFailures,
  boundaryParityVerdict,
  probeBoundarySubstrate,
} from '../boundary-parity-gate.mjs';

test('the verb exits clean over the real engine trees and reports what it measured', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean', JSON.stringify(verdict, null, 1));
  assert.equal(verdict.payload.verb, 'boundary-parity');
  assert.equal(verdict.payload.siteCount, 6);
  assert.equal(verdict.payload.twinSiteCount, 3);
  assert.equal(verdict.payload.mechanicalSiteCount, 4);
  assert.equal(verdict.payload.judgmentSiteCount, 2);
});

test('every attest is a sentence long enough to state what was measured', () => {
  assert.ok(BOUNDARY_PARITY_ATTESTS.length >= 8);
  for (const attest of BOUNDARY_PARITY_ATTESTS) {
    assert.equal(typeof attest, 'string');
    assert.ok(attest.length > 60, `this attest is too short to state what it measured: ${JSON.stringify(attest)}`);
  }
  assert.ok(BOUNDARY_PARITY_NOT_ATTESTED.length >= 4);
  for (const entry of BOUNDARY_PARITY_NOT_ATTESTED) {
    assert.ok(entry.length > 60, `this not-attested entry is too short to state the gap: ${JSON.stringify(entry)}`);
  }
});

function booleanPaths(value, path = []) {
  if (typeof value === 'boolean') return [path];
  if (Array.isArray(value)) return value.flatMap((entry, index) => booleanPaths(entry, [...path, index]));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => booleanPaths(entry, [...path, key]));
  }
  return [];
}

function withFlipped(value, path) {
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    return value.map((entry, index) => (index === head ? (rest.length === 0 ? !entry : withFlipped(entry, rest)) : entry));
  }
  return { ...value, [head]: rest.length === 0 ? !value[head] : withFlipped(value[head], rest) };
}

test('every boolean the substrate measures is read by a failure clause', () => {
  const substrate = probeBoundarySubstrate();
  const baseline = boundaryParityFailures(substrate).length;
  assert.equal(baseline, 0, boundaryParityFailures(substrate).join(' | '));
  const paths = booleanPaths(substrate);
  assert.ok(
    boundaryParityFailures(withFlipped(substrate, ['identity', 'codesDistinct'])).length > baseline,
    'flipping a boolean a failure clause is known to read added no failure, so this census would report every field unread as clean',
  );
  const unread = paths.filter((path) => boundaryParityFailures(withFlipped(substrate, path)).length <= baseline);
  assert.deepEqual(
    unread.map((path) => path.join('.')),
    [],
    'these probe fields are measured and rendered but no failure clause reads them, so the guarantee they stand for is unfalsifiable',
  );
});

test('every declared vocabulary the verb reports on is censused in both directions', () => {
  const substrate = probeBoundarySubstrate();
  assert.ok(substrate.vocabularies.length > 0, 'the substrate declares no vocabulary at all, so the closed census measures nothing');
  for (const vocabulary of substrate.vocabularies) {
    assert.ok(vocabulary.declared.length > 0, `${vocabulary.name} declares nothing, so its census classifies nothing`);
    assert.deepEqual([...vocabulary.unexercised], [], `${vocabulary.name} declares entries no specimen exercises`);
    assert.deepEqual([...vocabulary.undeclared], [], `${vocabulary.name} classifies specimens no declaration covers`);
    assert.deepEqual([...vocabulary.failing], [], `${vocabulary.name} carries entries that no longer behave as their specimen measures them`);
  }
});

test('a declared vocabulary entry that stops being exercised is a failure naming it', () => {
  const substrate = probeBoundarySubstrate();
  const censused = substrate.vocabularies[0];
  const failures = boundaryParityFailures({
    ...substrate,
    vocabularies: [{ ...censused, unexercised: ['a-dropped-entry'] }, ...substrate.vocabularies.slice(1)],
  });
  assert.ok(failures.some((failure) => /reach no specimen.*a-dropped-entry/s.test(failure)), failures.join(' | '));
});

test('a specimen that matches no declared vocabulary entry is a failure naming it', () => {
  const substrate = probeBoundarySubstrate();
  const censused = substrate.vocabularies[0];
  const failures = boundaryParityFailures({
    ...substrate,
    vocabularies: [{ ...censused, undeclared: ['an-unclassifiable-specimen'] }, ...substrate.vocabularies.slice(1)],
  });
  assert.ok(failures.some((failure) => /match no declared entry.*an-unclassifiable-specimen/s.test(failure)), failures.join(' | '));
});

test('every census refusal kind the census source can reach is exercised by a control that names it', () => {
  const substrate = probeBoundarySubstrate();
  const refusals = substrate.vocabularies.find((vocabulary) => vocabulary.name.includes('refusal kinds'));
  assert.ok(refusals !== undefined, 'the refusal kinds are no longer censused at all');
  assert.deepEqual([...refusals.unexercised], []);
  assert.deepEqual([...refusals.undeclared], []);
  for (const control of substrate.controls) {
    assert.equal(
      control.refusal,
      control.declaredRefusal,
      `the control ${control.name} halted as ${control.refusal} rather than as the ${control.declaredRefusal} it declares: ${control.detail}`,
    );
  }
});

test('the bounds, containment and exclusion guarantees are measured by the verb rather than by the tests alone', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.bounds.overCapRefusedUnread, true);
  assert.equal(substrate.bounds.overCountRefusedUnread, true);
  assert.equal(substrate.bounds.overTotalRefusedUnread, true);
  assert.equal(substrate.bounds.escapingRealPathRefusedUnread, true);
  assert.equal(substrate.bounds.irregularPathRefusedUnread, true);
  assert.equal(substrate.bounds.nestedBaseExcluded, true);
  assert.equal(substrate.bounds.dependencyOnlyUniverseRefused, true);
  assert.ok(substrate.bounds.childrenStarted > 0);
  assert.deepEqual([...substrate.bounds.undeadlinedChildren], []);
  const failures = boundaryParityFailures({
    ...substrate,
    bounds: { ...substrate.bounds, overCapRefusedUnread: false, undeadlinedChildren: ['node tsc --noEmit'] },
  });
  assert.ok(failures.some((failure) => /before any of it is read/.test(failure)), failures.join(' | '));
  assert.ok(failures.some((failure) => /no positive deadline/.test(failure)), failures.join(' | '));
});

test('the payload advertises the evasion classifiers as in force, because the verdict now consults them', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean', JSON.stringify(verdict, null, 1));
  assert.equal(
    Object.hasOwn(verdict.payload, 'declaredButUnwiredEvasionClassifiers'),
    false,
    'the payload still carries the key a receipt reader took as the classifiers being unwired',
  );
  assert.deepEqual(
    [...verdict.payload.evasionClassifiers],
    ['added-suppression', 'checked-scope', 'rule-severity', 'tsconfig-strictness'],
  );
});

test('the verdict no longer claims the evasion scans are unwired, and narrows the gap to a real tool run', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean');
  const stated = [...verdict.payload.notAttested].join(' ');
  assert.doesNotMatch(stated, /NOT wired/, `the payload still claims the evasion scans are unwired, which is no longer true: ${stated}`);
  assert.match(stated, /real eslint or a real tsc/i, `the narrowed gap about a real tool run is unstated: ${stated}`);
});

test('the verdict states plainly that both mechanical dispatches are still live', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean');
  const stated = [...verdict.payload.notAttested].join(' ');
  assert.match(stated, /still dispatch/i);
});

test('every control the substrate runs halts on the thing it names', () => {
  const substrate = probeBoundarySubstrate();
  const inert = substrate.controls.filter((control) => !(control.anchorPresent && control.halted && control.named));
  assert.deepEqual(inert.map((control) => `${control.name} (${control.detail})`), []);
  assert.deepEqual(
    [...new Set(substrate.controls.map((control) => control.declaredRefusal))].sort(),
    [...BOUNDARY_CENSUS_REFUSAL_KINDS],
    'the controls no longer cover exactly the refusal kinds the census declares',
  );
});

test('an identity probe that stopped distinguishing two TS codes is a failure naming the collision', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, identity: { ...substrate.identity, codesDistinct: false } });
  assert.ok(failures.some((failure) => /collaps|distinct/i.test(failure)), failures.join(' | '));
});

test('a comparator that started blocking an unchanged pre-existing finding is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, comparator: { ...substrate.comparator, unchangedPasses: false } });
  assert.ok(failures.some((failure) => /pre-existing|unchanged/i.test(failure)), failures.join(' | '));
});

test('a zero-file run that started reading as clean is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, failClosed: { ...substrate.failClosed, zeroFilesRefused: false } });
  assert.ok(failures.some((failure) => /zero files/i.test(failure)), failures.join(' | '));
});

test('a teardown that stopped running on the throw path is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, teardown: { ...substrate.teardown, tornDownOnThrow: false } });
  assert.ok(failures.some((failure) => /teardown|torn down/i.test(failure)), failures.join(' | '));
});

test('a first pass and recheck that stopped agreeing is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, equivalence: { ...substrate.equivalence, agree: false } });
  assert.ok(failures.some((failure) => /recheck|equivalen/i.test(failure)), failures.join(' | '));
});

test('an unlisted binary that stopped being refused before any child started is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, exec: { ...substrate.exec, refusedUnlisted: false, childrenStarted: 1 } });
  assert.ok(failures.some((failure) => /unlisted|before any child/i.test(failure)), failures.join(' | '));
});

test('a census that stopped resolving the real engine trees is a halt rather than a pass', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.census.ok, true, substrate.census.error);
});

test('an added suppression that stopped reaching the verdict through evaluate is a failure', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.evasionWiring.addedSuppressionBlocks, true, 'the substrate itself no longer reaches the added-suppression classifier through evaluate');
  const failures = boundaryParityFailures({ ...substrate, evasionWiring: { ...substrate.evasionWiring, addedSuppressionBlocks: false } });
  assert.ok(failures.some((failure) => /added-suppression.*declared but not reached/i.test(failure)), failures.join(' | '));
});

test('a resolved-config strictness downgrade that stopped reaching the verdict through evaluate is a failure', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.evasionWiring.strictnessDowngradeBlocks, true, 'the substrate itself no longer reaches the tsconfig-strictness classifier through evaluate');
  const failures = boundaryParityFailures({ ...substrate, evasionWiring: { ...substrate.evasionWiring, strictnessDowngradeBlocks: false } });
  assert.ok(failures.some((failure) => /tsconfig-strictness.*declared but not reached/i.test(failure)), failures.join(' | '));
});

test('an inherited suppression or an unchanged resolved config that started blocking through evaluate is a failure', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.evasionWiring.inheritedSuppressionPasses, true);
  assert.equal(substrate.evasionWiring.unchangedConfigPasses, true);
  const failures = boundaryParityFailures({
    ...substrate,
    evasionWiring: { ...substrate.evasionWiring, inheritedSuppressionPasses: false, unchangedConfigPasses: false },
  });
  assert.ok(failures.some((failure) => /presence rule/i.test(failure)), failures.join(' | '));
  assert.ok(failures.some((failure) => /config never changed/i.test(failure)), failures.join(' | '));
});
