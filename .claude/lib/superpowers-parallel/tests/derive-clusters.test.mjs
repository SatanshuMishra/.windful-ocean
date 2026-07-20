import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveClusters } from '../derive-clusters.mjs';

function msp(id, extra = {}) {
  return { id, dependsOn: [], fileScope: [], ...extra };
}

test('a single MSP forms exactly one singleton cluster', () => {
  const { clusters, audit } = deriveClusters([
    msp('m0', { fileScope: ['x/**'] }),
  ]);
  assert.deepEqual(clusters, [['m0']]);
  assert.equal(audit.clusterCount, 1);
});

test('a linear dependency chain forms exactly one cluster in bottom-up order', () => {
  const { clusters, audit } = deriveClusters([
    msp('a', { fileScope: ['lib/a.js'] }),
    msp('b', { fileScope: ['lib/b.js'], dependsOn: ['a'] }),
    msp('c', { fileScope: ['lib/c.js'], dependsOn: ['b'] }),
  ]);
  assert.deepEqual(clusters, [['a', 'b', 'c']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 0);
});

test('two independent MSPs with disjoint fileScope form two clusters', () => {
  const { clusters, audit } = deriveClusters([
    msp('a', { fileScope: ['lib/a.js'] }),
    msp('b', { fileScope: ['lib/b.js'] }),
  ]);
  assert.deepEqual(clusters, [['a'], ['b']]);
  assert.equal(audit.clusterCount, 2);
  assert.equal(audit.addedEdgeCount, 0);
});

test('fileScope overlap with no declared dependency merges into one cluster', () => {
  const { clusters, audit } = deriveClusters([
    msp('alpha', { fileScope: ['lib/shared.js'] }),
    msp('beta', { fileScope: ['lib/shared.js'] }),
  ]);
  assert.deepEqual(clusters, [['alpha', 'beta']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 1);
  assert.deepEqual(audit.added, [{ from: 'beta', to: 'alpha', reason: 'fileScope-overlap' }]);
});

test('a discovered semantic edge merges two otherwise-independent MSPs into one ordered cluster', () => {
  const { clusters, audit } = deriveClusters(
    [
      msp('a', { fileScope: ['lib/a.js'] }),
      msp('b', { fileScope: ['lib/b.js'] }),
    ],
    [{ from: 'b', to: 'a', reason: 'lsp-call' }],
  );
  assert.deepEqual(clusters, [['a', 'b']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 1);
  assert.deepEqual(audit.added, [{ from: 'b', to: 'a', reason: 'lsp-call' }]);
});

test('clusters are ordered by their lexicographically smallest member id, not by decomposition order', () => {
  const { clusters } = deriveClusters([
    msp('b1', { fileScope: ['lib/one.js'] }),
    msp('b2', { fileScope: ['lib/two.js'], dependsOn: ['b1'] }),
    msp('a1', { fileScope: ['lib/three.js'] }),
  ]);
  assert.deepEqual(clusters, [['a1'], ['b1', 'b2']]);
});

test('a discovered edge contradicting a declared dependency throws the standard cycle string', () => {
  assert.throws(
    () => deriveClusters(
      [
        msp('a', { fileScope: ['lib/a.js'], dependsOn: ['b'] }),
        msp('b', { fileScope: ['lib/b.js'] }),
      ],
      [{ from: 'b', to: 'a', reason: 'lsp-call' }],
    ),
    /dependency cycle detected among: a, b/,
  );
});

test('a declared dependency cycle throws the standard cycle string', () => {
  assert.throws(
    () => deriveClusters([
      msp('x', { dependsOn: ['y'] }),
      msp('y', { dependsOn: ['x'] }),
    ]),
    /dependency cycle detected among: x, y/,
  );
});

test('a dependsOn referencing an unknown MSP throws', () => {
  assert.throws(
    () => deriveClusters([msp('a', { dependsOn: ['ghost'] })]),
    /references unknown task: ghost/,
  );
});

test('a discovered edge referencing an unknown MSP throws', () => {
  assert.throws(
    () => deriveClusters([msp('a')], [{ from: 'a', to: 'ghost', reason: 'lsp-call' }]),
    /references unknown task: ghost/,
  );
});

test('the audit tallies every derived edge with its reason', () => {
  const { audit } = deriveClusters(
    [
      msp('a', { fileScope: ['lib/shared.js'] }),
      msp('b', { fileScope: ['lib/shared.js'] }),
      msp('c', { fileScope: ['lib/c.js'] }),
    ],
    [{ from: 'c', to: 'a', reason: 'lsp-call' }],
  );
  assert.equal(audit.addedEdgeCount, 2);
  assert.deepEqual(audit.added, [
    { from: 'c', to: 'a', reason: 'lsp-call' },
    { from: 'b', to: 'a', reason: 'fileScope-overlap' },
  ]);
});

test('a duplicate MSP id throws', () => {
  assert.throws(
    () => deriveClusters([msp('a'), msp('a')]),
    /duplicate task id: a/,
  );
});

test('a diamond dependency (m1,m2 both depend on m0; m3 depends on both) merges into one cluster ordered bottom-up with simultaneously-ready nodes tie-broken by original array index', () => {
  const diamond = (order) => order.map((id) => {
    if (id === 'm0') return msp('m0', { fileScope: ['lib/m0.js'] });
    if (id === 'm1') return msp('m1', { fileScope: ['lib/m1.js'], dependsOn: ['m0'] });
    if (id === 'm2') return msp('m2', { fileScope: ['lib/m2.js'], dependsOn: ['m0'] });
    return msp('m3', { fileScope: ['lib/m3.js'], dependsOn: ['m1', 'm2'] });
  });

  const forward = deriveClusters(diamond(['m0', 'm1', 'm2', 'm3']));
  assert.deepEqual(forward.clusters, [['m0', 'm1', 'm2', 'm3']]);

  const swapped = deriveClusters(diamond(['m0', 'm2', 'm1', 'm3']));
  assert.deepEqual(swapped.clusters, [['m0', 'm2', 'm1', 'm3']]);
});

test('all-MSPs-overlap with no declared deps orders the single cluster by input array index, not by id', () => {
  const { clusters, audit } = deriveClusters([
    msp('c', { fileScope: ['lib/shared.js'] }),
    msp('a', { fileScope: ['lib/shared.js'] }),
    msp('b', { fileScope: ['lib/shared.js'] }),
  ]);
  assert.deepEqual(clusters, [['c', 'a', 'b']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 3);
  assert.ok(
    audit.added.some((e) => e.from === 'a' && e.to === 'c' && e.reason === 'fileScope-overlap'),
    `expected an added edge {from:'a',to:'c',reason:'fileScope-overlap'} in ${JSON.stringify(audit.added)}`,
  );
});
