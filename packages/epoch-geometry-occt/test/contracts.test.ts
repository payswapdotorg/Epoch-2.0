import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeometryOperation } from '../src/index.ts';
import { createAnalyticKernel, createInMemoryTestKernel, UnknownShapeError } from '../src/index.ts';

const LEVELS = new Set(['native', 'analytic', 'unsupported']);

test('W011 contracts: capability levels are drawn only from native | analytic | unsupported', () => {
  for (const kernel of [createAnalyticKernel(), createInMemoryTestKernel()]) {
    const d = kernel.describe();
    const levels = [
      ...Object.values(d.capabilities.primitives),
      ...Object.values(d.capabilities.booleans),
      d.capabilities.transform,
      ...Object.values(d.capabilities.queries),
      ...Object.values(d.capabilities.freeform),
    ];
    for (const l of levels) assert.ok(LEVELS.has(l), `unexpected capability level ${String(l)}`);
  }
});

test('W011 contracts: GeometryKernel port surface is exactly describe() + execute()', () => {
  for (const kernel of [createAnalyticKernel(), createInMemoryTestKernel()]) {
    const names = Object.getOwnPropertyNames(kernel).sort();
    assert.deepStrictEqual(names, ['describe', 'execute']);
    assert.strictEqual(typeof kernel.describe(), 'object');
    assert.strictEqual(typeof kernel.execute, 'function');
  }
});

test('W011 contracts: analytic results are exact (tolerance 0) and carry digest + capability', () => {
  const r = createAnalyticKernel().execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] } satisfies GeometryOperation);
  assert.strictEqual(r.tolerance, 0);
  assert.strictEqual(r.capability, 'analytic');
  assert.strictEqual(r.digest.length, 64);
  assert.ok(r.shape !== undefined);
});

test('W011 contracts: unknown shape references are rejected', () => {
  assert.throws(() => createAnalyticKernel().execute({ op: 'volume', shape: 'deadbeef' } satisfies GeometryOperation), UnknownShapeError);
});
