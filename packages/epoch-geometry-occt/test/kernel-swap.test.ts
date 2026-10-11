import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeometryKernel } from '../src/index.ts';
import { createAnalyticKernel, createInMemoryTestKernel, UnsupportedOperationError } from '../src/index.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)));

function script(kernel: GeometryKernel) {
  const b = kernel.execute({ op: 'box', min: [0, 0, 0], max: [2, 3, 4] });
  const v0 = kernel.execute({ op: 'volume', shape: b.digest });
  const t = kernel.execute({ op: 'transform', shape: b.digest, transform: { translate: [5, 6, 7] } });
  const v1 = kernel.execute({ op: 'volume', shape: t.digest });
  const bounds = kernel.execute({ op: 'bounds', shape: t.digest });
  return { b, v0, t, v1, bounds };
}

test('W011 port swappability: the same op script runs on the analytic kernel and the in-memory test kernel', () => {
  const a = script(createAnalyticKernel());
  const t = script(createInMemoryTestKernel());
  for (const r of [a.b, a.v0, a.t, a.v1, a.bounds, t.b, t.v0, t.t, t.v1, t.bounds]) {
    assert.strictEqual(r.digest.length, 64);
    assert.strictEqual(r.tolerance, 0);
  }
  close(a.v0.value as number, 24);
  close(t.v0.value as number, 24);
  close(a.v1.value as number, 24); // rigid translate preserves volume
  close(t.v1.value as number, 24);
});

test('W011 port swappability: the test kernel honestly declares its narrower capabilities', () => {
  const d = createInMemoryTestKernel().describe();
  assert.strictEqual(d.capabilities.primitives.cylinder, 'unsupported');
  assert.throws(
    () => createInMemoryTestKernel().execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 1, height: 1 }),
    UnsupportedOperationError,
  );
});

test('W011 port swappability: each kernel owns its serialization identity (digests differ across kernels)', () => {
  const a = createAnalyticKernel().execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const t = createInMemoryTestKernel().execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  assert.notStrictEqual(a.digest, t.digest);
  const a2 = createAnalyticKernel().execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const t2 = createInMemoryTestKernel().execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  assert.strictEqual(a.digest, a2.digest); // per-kernel determinism holds
  assert.strictEqual(t.digest, t2.digest);
});
