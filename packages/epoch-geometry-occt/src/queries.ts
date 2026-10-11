import { flattenBoxes } from './booleans.ts';
import type { BRepShape, BRepSolid, SolidDefinition, Vec2, Vec3 } from './contracts.ts';
import { applyPoint, invertRigidUniform } from './linear.ts';

function solidsOf(shape: BRepShape): readonly BRepSolid[] {
  return shape.kind === 'compound' ? shape.solids : [shape];
}

/* exact closed-form volume per analytic definition */
export function definitionVolume(def: SolidDefinition): number {
  switch (def.kind) {
    case 'box':
      return (def.max[0] - def.min[0]) * (def.max[1] - def.min[1]) * (def.max[2] - def.min[2]);
    case 'cylinder':
      return Math.PI * def.radius * def.radius * def.height;
    case 'frustum':
      return (Math.PI * def.height * (def.radiusBottom * def.radiusBottom + def.radiusBottom * def.radiusTop + def.radiusTop * def.radiusTop)) / 3;
    case 'sphere':
      return (4 * Math.PI * def.radius * def.radius * def.radius) / 3;
    case 'torus':
      return 2 * Math.PI * Math.PI * def.majorRadius * def.minorRadius * def.minorRadius;
    case 'prism':
      return Math.abs(signedArea2D(def.base)) * def.height;
    case 'transformed':
      return definitionVolume(def.base) * def.uniformScale * def.uniformScale * def.uniformScale;
  }
}

export function shapeVolume(shape: BRepShape): number {
  let sum = 0;
  for (const s of solidsOf(shape)) sum += definitionVolume(s.definition);
  return sum;
}

export function shapeArea(shape: BRepShape): number {
  let sum = 0;
  for (const s of solidsOf(shape)) for (const f of s.faces) sum += f.area;
  return sum;
}

function definitionBounds(def: SolidDefinition): readonly [Vec3, Vec3] {
  switch (def.kind) {
    case 'box':
      return [def.min, def.max];
    case 'cylinder':
      return [[-def.radius, -def.radius, 0], [def.radius, def.radius, def.height]];
    case 'frustum': {
      const R = Math.max(def.radiusBottom, def.radiusTop);
      return [[-R, -R, 0], [R, R, def.height]];
    }
    case 'sphere':
      return [[-def.radius, -def.radius, -def.radius], [def.radius, def.radius, def.radius]];
    case 'torus': {
      const e = def.majorRadius + def.minorRadius;
      return [[-e, -e, -def.minorRadius], [e, e, def.minorRadius]];
    }
    case 'prism': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of def.base) {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      }
      return [[x0, y0, 0], [x1, y1, def.height]];
    }
    case 'transformed': {
      const [b0, b1] = definitionBounds(def.base);
      let mn: Vec3 = [Infinity, Infinity, Infinity];
      let mx: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          for (let k = 0; k < 2; k++) {
            const c = applyPoint(def.matrix, [i ? b1[0] : b0[0], j ? b1[1] : b0[1], k ? b1[2] : b0[2]]);
            mn = [Math.min(mn[0], c[0]), Math.min(mn[1], c[1]), Math.min(mn[2], c[2])];
            mx = [Math.max(mx[0], c[0]), Math.max(mx[1], c[1]), Math.max(mx[2], c[2])];
          }
        }
      }
      return [mn, mx];
    }
  }
}

export function shapeBounds(shape: BRepShape): readonly [Vec3, Vec3] | null {
  const solids = solidsOf(shape);
  if (solids.length === 0) return null;
  let mn: Vec3 = [Infinity, Infinity, Infinity];
  let mx: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) {
    const [a, b] = definitionBounds(s.definition);
    mn = [Math.min(mn[0], a[0]), Math.min(mn[1], a[1]), Math.min(mn[2], a[2])];
    mx = [Math.max(mx[0], b[0]), Math.max(mx[1], b[1]), Math.max(mx[2], b[2])];
  }
  return [mn, mx];
}

/* exact point membership */
export function shapeContains(shape: BRepShape, p: Vec3): boolean {
  for (const s of solidsOf(shape)) if (definitionContains(s.definition, p)) return true;
  return false;
}

export function definitionContains(def: SolidDefinition, p: Vec3): boolean {
  switch (def.kind) {
    case 'box':
      return p[0] >= def.min[0] && p[0] <= def.max[0]
        && p[1] >= def.min[1] && p[1] <= def.max[1]
        && p[2] >= def.min[2] && p[2] <= def.max[2];
    case 'cylinder':
      return p[2] >= 0 && p[2] <= def.height
        && p[0] * p[0] + p[1] * p[1] <= def.radius * def.radius;
    case 'frustum': {
      if (p[2] < 0 || p[2] > def.height) return false;
      const t = def.height === 0 ? 0 : p[2] / def.height;
      const r = def.radiusBottom + (def.radiusTop - def.radiusBottom) * t;
      return p[0] * p[0] + p[1] * p[1] <= r * r;
    }
    case 'sphere':
      return p[0] * p[0] + p[1] * p[1] + p[2] * p[2] <= def.radius * def.radius;
    case 'torus': {
      const rho = Math.hypot(p[0], p[1]);
      const dx = rho - def.majorRadius;
      return dx * dx + p[2] * p[2] <= def.minorRadius * def.minorRadius;
    }
    case 'prism':
      return p[2] >= 0 && p[2] <= def.height && convexPolygonContains(def.base, [p[0], p[1]]);
    case 'transformed':
      return definitionContains(def.base, applyPoint(invertRigidUniform(def.matrix, def.uniformScale), p));
  }
}

/* exact point->solid distance (0 inside) */
export function distanceToPoint(shape: BRepShape, p: Vec3): number {
  let best = Infinity;
  for (const s of solidsOf(shape)) best = Math.min(best, definitionDistance(s.definition, p));
  return best;
}

function definitionDistance(def: SolidDefinition, p: Vec3): number {
  switch (def.kind) {
    case 'box': {
      const dx = Math.max(def.min[0] - p[0], p[0] - def.max[0], 0);
      const dy = Math.max(def.min[1] - p[1], p[1] - def.max[1], 0);
      const dz = Math.max(def.min[2] - p[2], p[2] - def.max[2], 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    case 'sphere':
      return Math.max(0, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - def.radius);
    case 'cylinder': {
      const rho = Math.hypot(p[0], p[1]);
      const dz = p[2] < 0 ? -p[2] : p[2] > def.height ? p[2] - def.height : 0;
      const dr = Math.max(0, rho - def.radius);
      return Math.hypot(dr, dz);
    }
    case 'frustum': {
      // solid of revolution: exact distance reduces to the (rho, z) profile trapezoid
      const rho = Math.hypot(p[0], p[1]);
      return distanceToProfile(def.radiusBottom, def.radiusTop, def.height, rho, p[2]);
    }
    case 'torus': {
      const rho = Math.hypot(p[0], p[1]);
      return Math.max(0, Math.hypot(rho - def.majorRadius, p[2]) - def.minorRadius);
    }
    case 'prism': {
      const d2 = distanceToConvexPolygon(def.base, [p[0], p[1]]);
      const dz = p[2] < 0 ? -p[2] : p[2] > def.height ? p[2] - def.height : 0;
      return Math.hypot(d2, dz);
    }
    case 'transformed':
      return definitionDistance(def.base, applyPoint(invertRigidUniform(def.matrix, def.uniformScale), p)) * def.uniformScale;
  }
}

/** Exact AABB-pair distance. Non-box shape pairs are unsupported (see kernel notes). */
export function boxPairDistance(a: BRepShape, b: BRepShape): number {
  const A = flattenBoxes('distance', a);
  const B = flattenBoxes('distance', b);
  let best = Infinity;
  for (const x of A) {
    for (const y of B) {
      const dx = Math.max(x.min[0] - y.max[0], y.min[0] - x.max[0], 0);
      const dy = Math.max(x.min[1] - y.max[1], y.min[1] - x.max[1], 0);
      const dz = Math.max(x.min[2] - y.max[2], y.min[2] - x.max[2], 0);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  return best;
}

/* ---------------------------------------------------------------- 2D math */

function signedArea2D(pts: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    a += pts[i][0] * q[1] - q[0] * pts[i][1];
  }
  return a / 2;
}

function convexPolygonContains(pts: readonly Vec2[], p: readonly [number, number]): boolean {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cr < 0) return false;
  }
  return true;
}

function pointToSegment(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const apx = p[0] - a[0], apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  const dx = apx - t * abx, dy = apy - t * aby;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceToConvexPolygon(pts: readonly Vec2[], p: readonly [number, number]): number {
  if (convexPolygonContains(pts, p)) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    best = Math.min(best, pointToSegment(p, [a[0], a[1]], [b[0], b[1]]));
  }
  return best;
}

function distanceToProfile(R: number, r: number, h: number, rho: number, z: number): number {
  const poly: readonly (readonly [number, number])[] = [[0, 0], [R, 0], [r, h], [0, h]];
  const p: readonly [number, number] = [rho, z];
  if (convexPolygonContains(poly, p)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, pointToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}
