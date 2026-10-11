import type { BRepFace, BRepShape, Vec3 } from './contracts.ts';
import { circleFrame } from './linear.ts';

export interface Mesh {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly faceGroups: readonly { readonly faceId: string; readonly offset: number; readonly count: number }[];
  readonly triangleCount: number;
}

export interface TessellationOptions {
  readonly chordTolerance?: number;
  readonly maxSegments?: number;
}

const DEFAULT_TOL = 0.05;
const DEFAULT_MAX_SEG = 512;

/**
 * Deterministic tessellation for the derive-only world bridge.
 * Presentation data only: NOT part of the canonical digest. Segment counts are
 * pure functions of radius/tolerance (sqrt-based chord estimate, no libm acos),
 * so identical inputs produce identical meshes on a given platform.
 */
export function tessellateShape(shape: BRepShape, options: TessellationOptions = {}): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const faceGroups: { faceId: string; offset: number; count: number }[] = [];
  const solids = shape.kind === 'compound' ? shape.solids : [shape];
  for (const solid of solids) {
    for (const f of solid.faces) {
      const offset = indices.length;
      tessellateFace(f, options, positions, indices);
      if (indices.length > offset) faceGroups.push({ faceId: f.id, offset, count: indices.length - offset });
    }
  }
  return { positions, indices, faceGroups, triangleCount: indices.length / 3 };
}

function seg(radius: number, tol: number, maxSeg: number): number {
  const t = Math.min(Math.max(tol, 1e-9), radius);
  return Math.max(8, Math.min(maxSeg, Math.ceil(Math.PI / Math.sqrt((2 * t) / radius))));
}

function pushPoint(positions: number[], p: Vec3): number {
  const idx = positions.length / 3;
  positions.push(p[0], p[1], p[2]);
  return idx;
}

function ringPoint(center: Vec3, axis: Vec3, u: Vec3, v: Vec3, radius: number, angle: number, along: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    center[0] + radius * (c * u[0] + s * v[0]) + along * axis[0],
    center[1] + radius * (c * u[1] + s * v[1]) + along * axis[1],
    center[2] + radius * (c * u[2] + s * v[2]) + along * axis[2],
  ];
}

function gridTriangles(indices: number[], rows: number[][]): void {
  for (let j = 0; j + 1 < rows.length; j++) {
    const lo = rows[j];
    const hi = rows[j + 1];
    if (lo.length === 1) {
      for (let i = 0; i + 1 < hi.length; i++) indices.push(lo[0], hi[i], hi[i + 1]);
    } else if (hi.length === 1) {
      for (let i = 0; i + 1 < lo.length; i++) indices.push(lo[i], hi[0], lo[i + 1]);
    } else {
      for (let i = 0; i + 1 < lo.length; i++) {
        indices.push(lo[i], hi[i], hi[i + 1]);
        indices.push(lo[i], hi[i + 1], lo[i + 1]);
      }
    }
  }
}

function tessellateFace(f: BRepFace, options: TessellationOptions, positions: number[], indices: number[]): void {
  const tol = options.chordTolerance ?? DEFAULT_TOL;
  const maxSeg = options.maxSegments ?? DEFAULT_MAX_SEG;
  const s = f.surface;
  switch (s.kind) {
    case 'plane':
      tessellatePlanar(f, tol, maxSeg, positions, indices);
      return;
    case 'cylinder': {
      const [v0, v1] = f.vRange ?? [0, 0];
      const n = seg(s.radius, tol, maxSeg);
      const { u, v } = circleFrame(s.axis);
      const rows: number[][] = [];
      for (const along of [v0, v1]) {
        const row: number[] = [];
        for (let i = 0; i <= n; i++) row.push(pushPoint(positions, ringPoint(s.origin, s.axis, u, v, s.radius, (2 * Math.PI * i) / n, along)));
        rows.push(row);
      }
      gridTriangles(indices, rows);
      return;
    }
    case 'cone': {
      const n = seg(Math.max(s.radiusBottom, s.radiusTop), tol, maxSeg);
      const { u, v } = circleFrame(s.axis);
      const rows: number[][] = [];
      for (const pair of [[s.radiusBottom, 0], [s.radiusTop, s.height]] as const) {
        const row: number[] = [];
        for (let i = 0; i <= n; i++) row.push(pushPoint(positions, ringPoint(s.origin, s.axis, u, v, pair[0], (2 * Math.PI * i) / n, pair[1])));
        rows.push(row);
      }
      gridTriangles(indices, rows);
      return;
    }
    case 'sphere': {
      const r = s.radius;
      // A sphere is fully determined by origin+radius; the polar axis is a
      // tessellation parametrization choice. Fixed at +Z — geometrically exact
      // for transformed spheres too: rigid transforms map spheres to spheres,
      // and every generated point satisfies |p - origin| = r exactly.
      const axis: Vec3 = [0, 0, 1];
      const nU = seg(r, tol, maxSeg);
      const nV = Math.max(3, Math.ceil(nU / 2));
      const [u0, u1] = f.uRange ?? [0, 2 * Math.PI];
      const [v0, v1] = f.vRange ?? [-Math.PI / 2, Math.PI / 2];
      const { u, v } = circleFrame(axis);
      const rows: number[][] = [];
      for (let j = 0; j <= nV; j++) {
        const phi = v0 + ((v1 - v0) * j) / nV;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);
        if (j === 0 || j === nV) {
          rows.push([pushPoint(positions, [
            s.origin[0] + r * sinPhi * axis[0],
            s.origin[1] + r * sinPhi * axis[1],
            s.origin[2] + r * sinPhi * axis[2],
          ])]);
        } else {
          const row: number[] = [];
          for (let i = 0; i <= nU; i++) {
            const theta = u0 + ((u1 - u0) * i) / nU;
            const c = Math.cos(theta);
            const sn = Math.sin(theta);
            row.push(pushPoint(positions, [
              s.origin[0] + r * (cosPhi * (c * u[0] + sn * v[0]) + sinPhi * axis[0]),
              s.origin[1] + r * (cosPhi * (c * u[1] + sn * v[1]) + sinPhi * axis[1]),
              s.origin[2] + r * (cosPhi * (c * u[2] + sn * v[2]) + sinPhi * axis[2]),
            ]));
          }
          rows.push(row);
        }
      }
      gridTriangles(indices, rows);
      return;
    }
    case 'torus': {
      const R = s.majorRadius;
      const r = s.minorRadius;
      const nU = seg(R + r, tol, maxSeg);
      const nV = seg(r, tol, maxSeg);
      const { u, v } = circleFrame(s.axis);
      const [u0, u1] = f.uRange ?? [0, 2 * Math.PI];
      const [v0, v1] = f.vRange ?? [0, 2 * Math.PI];
      const rows: number[][] = [];
      for (let j = 0; j <= nV; j++) {
        const psi = v0 + ((v1 - v0) * j) / nV;
        const rad = R + r * Math.cos(psi);
        const zz = r * Math.sin(psi);
        const row: number[] = [];
        for (let i = 0; i <= nU; i++) {
          const theta = u0 + ((u1 - u0) * i) / nU;
          const c = Math.cos(theta);
          const sn = Math.sin(theta);
          row.push(pushPoint(positions, [
            s.origin[0] + rad * (c * u[0] + sn * v[0]) + zz * s.axis[0],
            s.origin[1] + rad * (c * u[1] + sn * v[1]) + zz * s.axis[1],
            s.origin[2] + rad * (c * u[2] + sn * v[2]) + zz * s.axis[2],
          ]));
        }
        rows.push(row);
      }
      gridTriangles(indices, rows);
      return;
    }
  }
}

function tessellatePlanar(f: BRepFace, tol: number, maxSeg: number, positions: number[], indices: number[]): void {
  const edges = f.edges;
  if (edges.length >= 3 && edges.every((e) => e.curve.kind === 'line')) {
    // polygon from boundary-ordered line edges: first start + every end (last closes the loop)
    const pts: number[] = [];
    const first = edges[0].curve;
    if (first.kind === 'line') pts.push(pushPoint(positions, first.start));
    for (const e of edges) {
      if (e.curve.kind !== 'line') return;
      const c = e.curve;
      const end: Vec3 = [c.start[0] + c.direction[0] * c.length, c.start[1] + c.direction[1] * c.length, c.start[2] + c.direction[2] * c.length];
      pts.push(pushPoint(positions, end));
    }
    for (let i = 1; i + 1 < pts.length; i++) indices.push(pts[0], pts[i], pts[i + 1]);
    return;
  }
  if (edges.length === 1 && edges[0].curve.kind === 'circle') {
    const c = edges[0].curve;
    const { u, v } = circleFrame(c.axis);
    const n = seg(c.radius, tol, maxSeg);
    const center = pushPoint(positions, c.center);
    const ring: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = c.startAngleRad + (c.sweepRad * i) / n;
      const co = Math.cos(a);
      const si = Math.sin(a);
      ring.push(pushPoint(positions, [
        c.center[0] + c.radius * (co * u[0] + si * v[0]),
        c.center[1] + c.radius * (co * u[1] + si * v[1]),
        c.center[2] + c.radius * (co * u[2] + si * v[2]),
      ]));
    }
    for (let i = 0; i < n; i++) indices.push(center, ring[i], ring[(i + 1) % n]);
    return;
  }
  // no other planar face shape is produced by this adapter's builders
}
