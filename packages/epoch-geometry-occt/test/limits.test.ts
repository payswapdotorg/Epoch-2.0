import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeometryOperation } from '../src/index.ts';
import { createAnalyticKernel, UnsupportedOperationError } from '../src/index.ts';

test('W011 honest limits: freeform capabilities are declared unsupported (fillet/chamfer/nurbs/offset/loft)', () => {
  const d = createAnalyticKernel().describe();
  for (const level of Object.values(d.capabilities.freeform)) assert.strictEqual(level, 'unsupported');
});

test('W011 honest limits: ops outside the bounded set (e.g. fillet) are rejected at runtime', () => {
  assert.throws(
    () => createAnalyticKernel().execute({ op: 'fillet' } as unknown as GeometryOperation),
    UnsupportedOperationError,
  );
});

test('W011 honest limits: booleans on non-box operands throw UnsupportedOperationError', () => {
  const c = createAnalyticKernel();
  const cyl = c.execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 1, height: 2 });
  assert.throws(() => c.execute({ op: 'union', operands: [cyl.digest, cyl.digest] }), UnsupportedOperationError);
});

test('W011 honest limits: non-convex prism profiles are rejected', () => {
  assert.throws(
    () => createAnalyticKernel().execute({ op: 'prism', base: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], height: 1 }),
    UnsupportedOperationError,
  );
});

test('W011 honest limits: shape-to-shape distance is box-only (cylinder rejected honestly)', () => {
  const c = createAnalyticKernel();
  const cyl = c.execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 1, height: 2 });
  const box = c.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  assert.throws(() => c.execute({ op: 'distance', shape: cyl.digest, other: box.digest }), UnsupportedOperationError);
});
