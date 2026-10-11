import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GeometryOperation } from '../src/index.ts';
import { createAnalyticKernel } from '../src/index.ts';

// Relative tolerance 1e-11: face areas (and other stored BRepShape content)
// are canonicalized to 12 significant digits per the determinism law, so
// query results legitimately differ from closed-form constants by up to
// ~5e-12 relative (observed for 20*pi^2: ~1.1e-12 relative). Volumes derive
// from unrounded definitions and sit far inside this bound.
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `expected ${actual} ~ ${expected}`);
const k = () => createAnalyticKernel();
const vol = (kernel: ReturnType<typeof k>, ref: string) => kernel.execute({ op: 'volume', shape: ref }).value as number;
const area = (kernel: ReturnType<typeof k>, ref: string) => kernel.execute({ op: 'area', shape: ref }).value as number;
const has = (kernel: ReturnType<typeof k>, ref: string, p: readonly number[]) =>
  kernel.execute({ op: 'contains', shape: ref, point: [p[0], p[1], p[2]] }).value as boolean;
const dist = (kernel: ReturnType<typeof k>, ref: string, p: readonly number[]) =>
  kernel.execute({ op: 'distance', shape: ref, point: [p[0], p[1], p[2]] }).value as number;

test('W011 analytic: box volume/area/bounds/membership exact', () => {
  const c = k();
  const r = c.execute({ op: 'box', min: [1, 1, 1], max: [3, 4, 5] } satisfies GeometryOperation);
  close(vol(c, r.digest), 24);
  close(area(c, r.digest), 52);
  const bounds = c.execute({ op: 'bounds', shape: r.digest }).value;
  assert.deepStrictEqual(bounds, [[1, 1, 1], [3, 4, 5]]);
  assert.equal(has(c, r.digest, [2, 2.5, 3]), true);
  assert.equal(has(c, r.digest, [0.5, 2, 3]), false);
});

test('W011 analytic: cylinder volume/area exact (45*pi, 48*pi)', () => {
  const c = k();
  const r = c.execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 3, height: 5 } satisfies GeometryOperation);
  close(vol(c, r.digest), 45 * Math.PI);
  close(area(c, r.digest), 48 * Math.PI);
});

test('W011 analytic: sphere volume/area exact (32*pi/3, 16*pi)', () => {
  const c = k();
  const r = c.execute({ op: 'sphere', origin: [0, 0, 0], radius: 2 } satisfies GeometryOperation);
  close(vol(c, r.digest), (32 * Math.PI) / 3);
  close(area(c, r.digest), 16 * Math.PI);
});

test('W011 analytic: frustum volume/area exact (28*pi)', () => {
  const c = k();
  const r = c.execute({ op: 'cone', origin: [0, 0, 0], axis: [0, 0, 1], radiusBottom: 4, radiusTop: 2, height: 3 } satisfies GeometryOperation);
  close(vol(c, r.digest), 28 * Math.PI);
  close(area(c, r.digest), Math.PI * (6 * Math.sqrt(13) + 20));
  assert.equal(has(c, r.digest, [2.5, 0, 1.5]), true);
  assert.equal(has(c, r.digest, [3.5, 0, 1.5]), false);
});

test('W011 analytic: torus volume/area exact (10*pi^2, 20*pi^2)', () => {
  const c = k();
  const r = c.execute({ op: 'torus', origin: [0, 0, 0], axis: [0, 0, 1], majorRadius: 5, minorRadius: 1 } satisfies GeometryOperation);
  close(vol(c, r.digest), 10 * Math.PI * Math.PI);
  close(area(c, r.digest), 20 * Math.PI * Math.PI);
});

test('W011 analytic: prism volume/area exact (24, 52)', () => {
  const c = k();
  const r = c.execute({ op: 'prism', base: [[0, 0], [4, 0], [4, 3], [0, 3]], height: 2 } satisfies GeometryOperation);
  close(vol(c, r.digest), 24);
  close(area(c, r.digest), 52);
});

test('W011 analytic: extrude along arbitrary axis keeps exact volume and placement', () => {
  const c = k();
  const r = c.execute({ op: 'extrude', profile: [[0, 0], [2, 0], [2, 2], [0, 2]], axis: [0, 1, 0], distance: 3 } satisfies GeometryOperation);
  close(vol(c, r.digest), 12);
  assert.equal(has(c, r.digest, [1, 1.5, -1]), true);
  assert.equal(has(c, r.digest, [1, 1.5, 1]), false);
});

test('W011 analytic: rigid transform preserves volume; translation shifts bounds; rotation rotates membership', () => {
  const c = k();
  const box = c.execute({ op: 'box', min: [0, 0, 0], max: [2, 3, 4] });
  const moved = c.execute({ op: 'transform', shape: box.digest, transform: { translate: [10, 0, 0] } });
  close(vol(c, moved.digest), 24);
  const movedBounds = c.execute({ op: 'bounds', shape: moved.digest }).value;
  assert.deepStrictEqual(movedBounds, [[10, 0, 0], [12, 3, 4]]);
  const unit = c.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const rot = c.execute({ op: 'transform', shape: unit.digest, transform: { rotate: { axis: [0, 0, 1], angleRad: Math.PI / 2 } } });
  close(vol(c, rot.digest), 1);
  assert.equal(has(c, rot.digest, [-0.5, 0.5, 0.5]), true);
  assert.equal(has(c, rot.digest, [0.9, 0.9, 0.5]), false);
  const scaled = c.execute({ op: 'transform', shape: unit.digest, transform: { uniformScale: 2 } });
  close(vol(c, scaled.digest), 8);
});

test('W011 analytic: point membership exact for cylinder, sphere, torus', () => {
  const c = k();
  const cyl = c.execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 1, height: 5 });
  assert.equal(has(c, cyl.digest, [0.5, 0, 1]), true);
  assert.equal(has(c, cyl.digest, [0.9, 0.9, 1]), false);
  const sph = c.execute({ op: 'sphere', origin: [0, 0, 0], radius: 2 });
  assert.equal(has(c, sph.digest, [1, 1, 1]), true);
  assert.equal(has(c, sph.digest, [2, 2, 2]), false);
  const tor = c.execute({ op: 'torus', origin: [0, 0, 0], axis: [0, 0, 1], majorRadius: 5, minorRadius: 1 });
  assert.equal(has(c, tor.digest, [5, 0, 0]), true);
  assert.equal(has(c, tor.digest, [0, 0, 0]), false);
});

test('W011 analytic: point-to-solid distance exact (sphere, cylinder, box, torus)', () => {
  const c = k();
  const sph = c.execute({ op: 'sphere', origin: [0, 0, 0], radius: 1 });
  close(dist(c, sph.digest, [0, 0, 5]), 4);
  close(dist(c, sph.digest, [0.5, 0, 0]), 0);
  const cyl = c.execute({ op: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: 1, height: 5 });
  close(dist(c, cyl.digest, [0, 0, 7]), 2);
  close(dist(c, cyl.digest, [3, 0, 2]), 2);
  close(dist(c, cyl.digest, [3, 0, 7]), Math.sqrt(8));
  const box = c.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  close(dist(c, box.digest, [3, 0.5, 0.5]), 2);
  const tor = c.execute({ op: 'torus', origin: [0, 0, 0], axis: [0, 0, 1], majorRadius: 5, minorRadius: 1 });
  close(dist(c, tor.digest, [0, 0, 0]), 4);
});

test('W011 analytic: box-to-box distance exact (gap, overlap)', () => {
  const c = k();
  const a = c.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const b = c.execute({ op: 'box', min: [3, 0, 0], max: [4, 1, 1] });
  close(c.execute({ op: 'distance', shape: a.digest, other: b.digest }).value as number, 2);
  const o = c.execute({ op: 'box', min: [0.5, 0.5, 0.5], max: [1.5, 1.5, 1.5] });
  close(c.execute({ op: 'distance', shape: a.digest, other: o.digest }).value as number, 0);
});
