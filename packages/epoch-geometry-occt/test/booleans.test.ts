import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalyticKernel } from '../src/index.ts';

const k = () => createAnalyticKernel();
const vol = (ref: string) => k().execute;
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)));

test('W011 booleans: union/subtract/intersect volumes exact for overlapping boxes', () => {
  const c = k();
  const A = c.execute({ op: 'box', min: [0, 0, 0], max: [2, 2, 2] });
  const B = c.execute({ op: 'box', min: [1, 1, 1], max: [3, 3, 3] });
  const u = c.execute({ op: 'union', operands: [A.digest, B.digest] });
  close(c.execute({ op: 'volume', shape: u.digest }).value as number, 15); // 8 + 8 - 1
  const s = c.execute({ op: 'subtract', operands: [A.digest, B.digest] });
  close(c.execute({ op: 'volume', shape: s.digest }).value as number, 7);
  const i = c.execute({ op: 'intersect', operands: [A.digest, B.digest] });
  close(c.execute({ op: 'volume', shape: i.digest }).value as number, 1);
});

test('W011 booleans: disjoint operands (union sums, subtract identity, intersect empty)', () => {
  const c = k();
  const A = c.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const C = c.execute({ op: 'box', min: [10, 10, 10], max: [11, 11, 11] });
  close(c.execute({ op: 'volume', shape: c.execute({ op: 'union', operands: [A.digest, C.digest] }).digest }).value as number, 2);
  close(c.execute({ op: 'volume', shape: c.execute({ op: 'subtract', operands: [A.digest, C.digest] }).digest }).value as number, 1);
  const empty = c.execute({ op: 'intersect', operands: [A.digest, C.digest] });
  close(c.execute({ op: 'volume', shape: empty.digest }).value as number, 0);
  assert.equal(c.execute({ op: 'bounds', shape: empty.digest }).value, null);
  assert.equal(c.execute({ op: 'contains', shape: empty.digest, point: [0.5, 0.5, 0.5] }).value, false);
});

test('W011 booleans: interior subtraction membership matches analytic expectation', () => {
  const c = k();
  const A = c.execute({ op: 'box', min: [0, 0, 0], max: [2, 2, 2] });
  const inner = c.execute({ op: 'box', min: [0.5, 0.5, 0.5], max: [1.5, 1.5, 1.5] });
  const s = c.execute({ op: 'subtract', operands: [A.digest, inner.digest] });
  close(c.execute({ op: 'volume', shape: s.digest }).value as number, 7);
  assert.equal(c.execute({ op: 'contains', shape: s.digest, point: [0.25, 0.25, 0.25] }).value, true);
  assert.equal(c.execute({ op: 'contains', shape: s.digest, point: [1, 1, 1] }).value, false);
});

test('W011 booleans: boolean results are deterministic (fresh kernels, identical digests)', () => {
  const run = (kernel: ReturnType<typeof createAnalyticKernel>) => {
    const A = kernel.execute({ op: 'box', min: [0, 0, 0], max: [2, 2, 2] });
    const B = kernel.execute({ op: 'box', min: [1, 1, 1], max: [3, 3, 3] });
    return kernel.execute({ op: 'subtract', operands: [A.digest, B.digest] }).digest;
  };
  assert.strictEqual(run(createAnalyticKernel()), run(createAnalyticKernel()));
});
