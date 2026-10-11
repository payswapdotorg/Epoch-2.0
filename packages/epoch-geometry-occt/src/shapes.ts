import { canonicalNumber, contentDigest } from './canonical.ts';
import type {
  AnalyticCurve, AnalyticSurface, BRepEdge, BRepFace, BRepShape, BRepSolid,
  BRepVertex, Mat4, SolidDefinition, TransformSpec, Vec2, Vec3,
} from './contracts.ts';
import { InvalidGeometryError, UnsupportedOperationError } from './errors.ts';
import {
  add, applyDir, applyPoint, circleFrame, isIdentity, matMul, matRotateAboutAxis, matTranslate,
  matUniformScale, normalize, sub, v3, vlen, vscale,
} from './linear.ts';

const TWO_PI = 2 * Math.PI;
const PI = Math.PI;

function positive(n: number, what: string): number {
  if (!(n > 0)) throw new InvalidGeometryError(`${what} must be > 0 (got ${n})`);
  return canonicalNumber(n);
}

const vertexId = (p: Vec3): string => 'v:' + contentDigest([...p]).slice(0, 12);
const makeVertex = (p: Vec3): BRepVertex => ({ id: vertexId(p), point: p });
const edgeId = (curve: AnalyticCurve): string => 'e:' + contentDigest(curve).slice(0, 12);
const faceId = (f: Omit<BRepFace, 'id'>): string =>
  'f:' + contentDigest({ surface: f.surface, uRange: f.uRange, vRange: f.vRange, uClosed: f.uClosed, vClosed: f.vClosed, orientation: f.orientation }).slice(0, 12);

function face(fields: Omit<BRepFace, 'id'>): BRepFace {
  return { ...fields, id: faceId(fields) };
}

function lineEdge(a: Vec3, b: Vec3): BRepEdge {
  const d = sub(b, a);
  const len = vlen(d);
  if (!(len > 0)) throw new InvalidGeometryError('degenerate line edge (zero length)');
  const curve: AnalyticCurve = { kind: 'line', start: a, direction: normalize(d), length: len };
  return { id: edgeId(curve), curve, closed: false, startVertex: vertexId(a), endVertex: vertexId(b) };
}

function arcEndpoint(curve: Extract<AnalyticCurve, { kind: 'circle' }>, which: 'start' | 'end'): Vec3 | null {
  if (curve.sweepRad >= TWO_PI) return null;
  const { u, v } = circleFrame(curve.axis);
  const alpha = which === 'start' ? curve.startAngleRad : curve.startAngleRad + curve.sweepRad;
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return add(curve.center, vscale(add(vscale(u, c), vscale(v, s)), curve.radius));
}

function circleEdge(center: Vec3, axis: Vec3, radius: number, startAngleRad = 0, sweepRad = TWO_PI): BRepEdge {
  const curve: AnalyticCurve = { kind: 'circle', center, axis, radius, startAngleRad, sweepRad };
  if (sweepRad >= TWO_PI) {
    return { id: edgeId(curve), curve, closed: true, startVertex: null, endVertex: null };
  }
  const s = arcEndpoint(curve, 'start');
  const e = arcEndpoint(curve, 'end');
  return {
    id: edgeId(curve), curve, closed: false,
    startVertex: s === null ? null : vertexId(s),
    endVertex: e === null ? null : vertexId(e),
  };
}

function assembleSolid(faces: readonly BRepFace[], vertices: readonly BRepVertex[], definition: SolidDefinition): BRepSolid {
  const edgeMap = new Map<string, BRepEdge>();
  for (const f of faces) {
    for (const e of f.edges) if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
  }
  return { kind: 'solid', faces, edges: [...edgeMap.values()], vertices, definition };
}

/* ------------------------------------------------------------------ box */

export function buildBox(min: Vec3, max: Vec3): BRepSolid {
  const mn = v3(min[0], min[1], min[2]);
  const mx = v3(max[0], max[1], max[2]);
  for (let i = 0; i < 3; i++) {
    if (!(mx[i] > mn[i])) throw new InvalidGeometryError(`box extent ${i} must be positive`);
  }
  const [x0, y0, z0] = mn;
  const [x1, y1, z1] = mx;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const rectFace = (origin: Vec3, normal: Vec3, a: Vec3, b: Vec3, c: Vec3, d: Vec3, area: number): BRepFace =>
    face({
      surface: { kind: 'plane', origin, normal },
      uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
      area: canonicalNumber(area),
      edges: [lineEdge(a, b), lineEdge(b, c), lineEdge(c, d), lineEdge(d, a)],
    });
  const faces: BRepFace[] = [
    rectFace([x1, y0, z0], [1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], dy * dz),
    rectFace([x0, y0, z0], [-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], dy * dz),
    rectFace([x0, y1, z0], [0, 1, 0], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], dx * dz),
    rectFace([x0, y0, z0], [0, -1, 0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], dx * dz),
    rectFace([x0, y0, z1], [0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], dx * dy),
    rectFace([x0, y0, z0], [0, 0, -1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], dx * dy),
  ];
  const corners: readonly Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const vertices: BRepVertex[] = corners.map((p) => makeVertex(p));
  return assembleSolid(faces, vertices, { kind: 'box', min: mn, max: mx });
}

/* -------------------------------------------------------------- cylinder */

export function buildCylinder(radius: number, height: number): BRepSolid {
  const r = positive(radius, 'cylinder radius');
  const h = positive(height, 'cylinder height');
  const seamA: Vec3 = [r, 0, 0];
  const seamB: Vec3 = [r, 0, h];
  const topCircle = circleEdge([0, 0, h], [0, 0, 1], r);
  const bottomCircle = circleEdge([0, 0, 0], [0, 0, 1], r);
  const side = face({
    surface: { kind: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: r },
    uRange: [0, TWO_PI], vRange: [0, h], uClosed: true, vClosed: false, orientation: 1,
    area: canonicalNumber(TWO_PI * r * h),
    edges: [lineEdge(seamA, seamB), topCircle, lineEdge(seamB, seamA), bottomCircle],
  });
  const top = face({
    surface: { kind: 'plane', origin: [0, 0, h], normal: [0, 0, 1] },
    uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
    area: canonicalNumber(PI * r * r), edges: [topCircle],
  });
  const bottom = face({
    surface: { kind: 'plane', origin: [0, 0, 0], normal: [0, 0, -1] },
    uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
    area: canonicalNumber(PI * r * r), edges: [bottomCircle],
  });
  return assembleSolid([side, top, bottom], [makeVertex(seamA), makeVertex(seamB)],
    { kind: 'cylinder', origin: [0, 0, 0], axis: [0, 0, 1], radius: r, height: h });
}

/* --------------------------------------------------------- cone/frustum */

export function buildFrustum(radiusBottom: number, radiusTop: number, height: number): BRepSolid {
  const R = positive(radiusBottom, 'cone radiusBottom');
  const rt = canonicalNumber(radiusTop);
  if (rt < 0) throw new InvalidGeometryError('cone radiusTop must be >= 0');
  const h = positive(height, 'cone height');
  const slant = Math.sqrt(h * h + (R - rt) * (R - rt));
  const seamA: Vec3 = [R, 0, 0];
  const seamB: Vec3 = [rt, 0, h];
  const bottomCircle = circleEdge([0, 0, 0], [0, 0, 1], R);
  const faces: BRepFace[] = [face({
    surface: { kind: 'cone', origin: [0, 0, 0], axis: [0, 0, 1], radiusBottom: R, radiusTop: rt, height: h },
    uRange: [0, TWO_PI], vRange: [0, h], uClosed: true, vClosed: false, orientation: 1,
    area: canonicalNumber(PI * (R + rt) * slant),
    edges: [lineEdge(seamA, seamB), lineEdge(seamB, seamA), bottomCircle],
  })];
  faces.push(face({
    surface: { kind: 'plane', origin: [0, 0, 0], normal: [0, 0, -1] },
    uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
    area: canonicalNumber(PI * R * R), edges: [bottomCircle],
  }));
  const vertices: BRepVertex[] = [makeVertex(seamA)];
  if (rt > 0) {
    const topCircle = circleEdge([0, 0, h], [0, 0, 1], rt);
    faces.push(face({
      surface: { kind: 'plane', origin: [0, 0, h], normal: [0, 0, 1] },
      uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
      area: canonicalNumber(PI * rt * rt), edges: [topCircle],
    }));
    vertices.push(makeVertex(seamB));
  } else {
    vertices.push(makeVertex([0, 0, h])); // apex
  }
  return assembleSolid(faces, vertices,
    { kind: 'frustum', origin: [0, 0, 0], axis: [0, 0, 1], radiusBottom: R, radiusTop: rt, height: h });
}

/* ---------------------------------------------------------------- sphere */

export function buildSphere(radius: number): BRepSolid {
  const r = positive(radius, 'sphere radius');
  // seam meridian at u=0: half great circle through both poles
  const seam = circleEdge([0, 0, 0], [0, 1, 0], r, 0, PI);
  const f = face({
    surface: { kind: 'sphere', origin: [0, 0, 0], radius: r },
    uRange: [0, TWO_PI], vRange: [-PI / 2, PI / 2], uClosed: true, vClosed: false, orientation: 1,
    area: canonicalNumber(4 * PI * r * r), edges: [seam],
  });
  return assembleSolid([f], [makeVertex([0, 0, -r]), makeVertex([0, 0, r])],
    { kind: 'sphere', origin: [0, 0, 0], radius: r });
}

/* ----------------------------------------------------------------- torus */

export function buildTorus(majorRadius: number, minorRadius: number): BRepSolid {
  const R = positive(majorRadius, 'torus majorRadius');
  const r = positive(minorRadius, 'torus minorRadius');
  const seam = circleEdge([R, 0, 0], [0, 1, 0], r); // meridian circle at u=0
  const f = face({
    surface: { kind: 'torus', origin: [0, 0, 0], axis: [0, 0, 1], majorRadius: R, minorRadius: r },
    uRange: [0, TWO_PI], vRange: [0, TWO_PI], uClosed: true, vClosed: true, orientation: 1,
    area: canonicalNumber(4 * PI * PI * R * r), edges: [seam],
  });
  return assembleSolid([f], [], { kind: 'torus', origin: [0, 0, 0], axis: [0, 0, 1], majorRadius: R, minorRadius: r });
}

/* ----------------------------------------------------------------- prism */

function normalizeToCCWConvex(base: readonly Vec2[]): Vec2[] {
  if (base.length < 3) throw new InvalidGeometryError('prism profile needs at least 3 points');
  const pts: Vec2[] = base.map((p) => [canonicalNumber(p[0]), canonicalNumber(p[1])]);
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    area2 += pts[i][0] * q[1] - q[0] * pts[i][1];
  }
  if (area2 < 0) pts.reverse();
  const dedup: Vec2[] = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) dedup.push(p);
  }
  if (dedup.length > 1) {
    const f = dedup[0];
    const l = dedup[dedup.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) dedup.pop();
  }
  if (dedup.length < 3) throw new InvalidGeometryError('degenerate prism profile');
  for (let i = 0; i < dedup.length; i++) {
    const o = dedup[i];
    const a = dedup[(i + 1) % dedup.length];
    const b = dedup[(i + 2) % dedup.length];
    const cr = (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    if (cr < 0) {
      throw new UnsupportedOperationError('prism', 'profile is not convex; only convex polygonal profiles are supported by the analytic adapter');
    }
  }
  return dedup;
}

export function buildPrism(base: readonly Vec2[], height: number): BRepSolid {
  const pts = normalizeToCCWConvex(base);
  const h = positive(height, 'prism height');
  const n = pts.length;
  const at = (i: number, z: number): Vec3 => v3(pts[i % n][0], pts[i % n][1], z);
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n];
    area2 += pts[i][0] * q[1] - q[0] * pts[i][1];
  }
  const capArea = Math.abs(area2 / 2);
  const bottomEdges: BRepEdge[] = [];
  const topEdges: BRepEdge[] = [];
  for (let i = 0; i < n; i++) {
    bottomEdges.push(lineEdge(at(i, 0), at(i + 1, 0)));
    topEdges.push(lineEdge(at(i, h), at(i + 1, h)));
  }
  const faces: BRepFace[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(i, 0);
    const b = at(i + 1, 0);
    const c = at(i + 1, h);
    const d = at(i, h);
    const e = sub(b, a);
    const outward = normalize([e[1], -e[0], 0]); // CCW base -> outward side normal
    faces.push(face({
      surface: { kind: 'plane', origin: a, normal: outward },
      uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
      area: canonicalNumber(vlen(e) * h),
      edges: [lineEdge(a, b), lineEdge(b, c), lineEdge(c, d), lineEdge(d, a)],
    }));
  }
  faces.push(face({
    surface: { kind: 'plane', origin: at(0, 0), normal: [0, 0, -1] },
    uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
    area: canonicalNumber(capArea), edges: bottomEdges,
  }));
  faces.push(face({
    surface: { kind: 'plane', origin: at(0, h), normal: [0, 0, 1] },
    uRange: null, vRange: null, uClosed: false, vClosed: false, orientation: 1,
    area: canonicalNumber(capArea), edges: topEdges,
  }));
  const vertices: BRepVertex[] = [];
  for (let i = 0; i < n; i++) vertices.push(makeVertex(at(i, 0)));
  for (let i = 0; i < n; i++) vertices.push(makeVertex(at(i, h)));
  return assembleSolid(faces, vertices, { kind: 'prism', base: pts, height: h });
}

/* -------------------------------------------------------------- transform */

function transformSurface(surface: AnalyticSurface, m: Mat4, s: number): AnalyticSurface {
  switch (surface.kind) {
    case 'plane':
      return { kind: 'plane', origin: applyPoint(m, surface.origin), normal: applyDir(m, surface.normal) };
    case 'cylinder':
      return { kind: 'cylinder', origin: applyPoint(m, surface.origin), axis: applyDir(m, surface.axis), radius: canonicalNumber(surface.radius * s) };
    case 'cone':
      return {
        kind: 'cone', origin: applyPoint(m, surface.origin), axis: applyDir(m, surface.axis),
        radiusBottom: canonicalNumber(surface.radiusBottom * s),
        radiusTop: canonicalNumber(surface.radiusTop * s),
        height: canonicalNumber(surface.height * s),
      };
    case 'sphere':
      return { kind: 'sphere', origin: applyPoint(m, surface.origin), radius: canonicalNumber(surface.radius * s) };
    case 'torus':
      return {
        kind: 'torus', origin: applyPoint(m, surface.origin), axis: applyDir(m, surface.axis),
        majorRadius: canonicalNumber(surface.majorRadius * s),
        minorRadius: canonicalNumber(surface.minorRadius * s),
      };
  }
}

function transformEdge(e: BRepEdge, m: Mat4, s: number): BRepEdge {
  const curve: AnalyticCurve = e.curve.kind === 'line'
    ? { kind: 'line', start: applyPoint(m, e.curve.start), direction: applyDir(m, e.curve.direction), length: canonicalNumber(e.curve.length * s) }
    : {
        kind: 'circle', center: applyPoint(m, e.curve.center), axis: applyDir(m, e.curve.axis),
        radius: canonicalNumber(e.curve.radius * s), startAngleRad: e.curve.startAngleRad, sweepRad: e.curve.sweepRad,
      };
  let start: Vec3 | null;
  let end: Vec3 | null;
  if (curve.kind === 'line') {
    start = curve.start;
    end = add(curve.start, vscale(curve.direction, curve.length));
  } else {
    start = arcEndpoint(curve, 'start');
    end = arcEndpoint(curve, 'end');
  }
  return {
    id: edgeId(curve), curve, closed: e.closed,
    startVertex: start === null ? null : vertexId(start),
    endVertex: end === null ? null : vertexId(end),
  };
}

function transformRanges(surface: AnalyticSurface, uRange: readonly [number, number] | null, vRange: readonly [number, number] | null, s: number): { uRange: readonly [number, number] | null; vRange: readonly [number, number] | null } {
  if (surface.kind === 'cylinder' || surface.kind === 'cone') {
    return { uRange, vRange: vRange === null ? null : [canonicalNumber(vRange[0] * s), canonicalNumber(vRange[1] * s)] };
  }
  return { uRange, vRange };
}

export function transformSolid(solid: BRepSolid, matrix: Mat4, scale: number): BRepSolid {
  const faces = solid.faces.map((f) => {
    const ranges = transformRanges(f.surface, f.uRange, f.vRange, scale);
    return face({
      surface: transformSurface(f.surface, matrix, scale),
      uRange: ranges.uRange, vRange: ranges.vRange,
      uClosed: f.uClosed, vClosed: f.vClosed, orientation: f.orientation,
      area: canonicalNumber(f.area * scale * scale),
      edges: f.edges.map((e) => transformEdge(e, matrix, scale)),
    });
  });
  const vertices = solid.vertices.map((v) => makeVertex(applyPoint(matrix, v.point)));
  const definition: SolidDefinition = solid.definition.kind === 'transformed'
    ? {
        kind: 'transformed', base: solid.definition.base,
        matrix: matMul(matrix, solid.definition.matrix),
        uniformScale: canonicalNumber(scale * solid.definition.uniformScale),
      }
    : { kind: 'transformed', base: solid.definition, matrix, uniformScale: canonicalNumber(scale) };
  return assembleSolid(faces, vertices, definition);
}

export function transformShape(shape: BRepShape, spec: TransformSpec): BRepShape {
  const s = spec.uniformScale ?? 1;
  if (!(s > 0)) throw new InvalidGeometryError('uniformScale must be > 0');
  if (!spec.rotate && !spec.translate && spec.uniformScale === undefined) return shape;
  let m: Mat4 = matUniformScale(s);
  if (spec.rotate) m = matMul(matRotateAboutAxis(spec.rotate.axis, spec.rotate.angleRad, spec.rotate.origin ?? [0, 0, 0]), m);
  if (spec.translate) m = matMul(matTranslate(spec.translate), m);
  // No-op short-circuit: EXACT identity matrix only. (An earlier version
  // compared against s*I, which wrongly treated a pure uniform scale —
  // m === s*I — as a no-op and dropped the scaling entirely.)
  if (isIdentity(m)) return shape;
  return shape.kind === 'compound'
    ? { kind: 'compound', solids: shape.solids.map((x) => transformSolid(x, m, s)) }
    : transformSolid(shape, m, s);
}
