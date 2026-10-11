import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeometryOperation } from '../src/index.ts';
import { canonicalStringify, createAnalyticKernel, projectShape, tessellateShape } from '../src/index.ts';

const cyl: GeometryOperation = { op: 'cylinder', origin: [1, -2, 3], axis: [0, 0.6, 0.8], radius: 3, height: 5 };

test('W011 determinism: identical primitive inputs produce byte-identical canonical serialization + identical digest', () => {
  const r1 = createAnalyticKernel().execute(cyl);
  const r2 = createAnalyticKernel().execute(cyl);
  assert.strictEqual(canonicalStringify(r1.shape), canonicalStringify(r2.shape));
  assert.strictEqual(r1.digest, r2.digest);
});

test('W011 determinism: digests are independent of kernel execution history (content addressing)', () => {
  const box: GeometryOperation = { op: 'box', min: [0, 0, 0], max: [2, 2, 2] };
  const kA = createAnalyticKernel();
  const kB = createAnalyticKernel();
  kA.execute(box);
  const a = kA.execute(cyl);
  const b = kB.execute(cyl);
  kB.execute(box);
  assert.strictEqual(a.digest, b.digest);
});

test('W011 determinism: full op chain (primitive -> transform -> boolean) reproduces identical digests', () => {
  const run = (kernel: ReturnType<typeof createAnalyticKernel>) => {
    const box = kernel.execute({ op: 'box', min: [0, 0, 0], max: [3, 3, 3] });
    const moved = kernel.execute({ op: 'transform', shape: box.digest, transform: { translate: [1, 1, 1] } });
    const other = kernel.execute({ op: 'box', min: [2, 2, 2], max: [4, 4, 4] });
    const union = kernel.execute({ op: 'union', operands: [moved.digest, other.digest] });
    return { box, moved, other, union };
  };
  const a = run(createAnalyticKernel());
  const b = run(createAnalyticKernel());
  for (const key of ['box', 'moved', 'other', 'union'] as const) assert.strictEqual(a[key].digest, b[key].digest);
});

test('W011 determinism: no timestamps or random ids — face ids are content-derived and stable', () => {
  const r1 = createAnalyticKernel().execute(cyl);
  const r2 = createAnalyticKernel().execute(cyl);
  const ids = (r: typeof r1) => (r.shape !== undefined && r.shape.kind === 'solid' ? r.shape.faces.map((f) => f.id) : []);
  assert.deepStrictEqual(ids(r1), ids(r2));
});

test('W011 determinism: canonical serialization sorts keys and rounds to 12 significant digits', () => {
  assert.strictEqual(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.strictEqual(canonicalStringify([0.1 + 0.2]), '[0.3]');
  assert.strictEqual(canonicalStringify([-0]), '[0]');
});

test('W011 determinism: tessellation is a pure deterministic function (presentation layer)', () => {
  const r = createAnalyticKernel().execute(cyl);
  const s = r.shape!;
  assert.deepStrictEqual(tessellateShape(s), tessellateShape(s));
  assert.deepStrictEqual(projectShape(s, r.digest, { id: 'k', version: '0' }), projectShape(s, r.digest, { id: 'k', version: '0' }));
});
