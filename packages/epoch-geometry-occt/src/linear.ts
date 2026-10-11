import { canonicalNumber } from './canonical.ts';
import type { Mat4, Vec3 } from './contracts.ts';
import { InvalidGeometryError } from './errors.ts';

export function v3(x: number, y: number, z: number): Vec3 {
  return [canonicalNumber(x), canonicalNumber(y), canonicalNumber(z)];
}
export function add(a: Vec3, b: Vec3): Vec3 { return v3(a[0] + b[0], a[1] + b[1], a[2] + b[2]); }
export function sub(a: Vec3, b: Vec3): Vec3 { return v3(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function vscale(a: Vec3, s: number): Vec3 { return v3(a[0] * s, a[1] * s, a[2] * s); }
export function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a: Vec3, b: Vec3): Vec3 {
  return v3(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
}
export function vlen(a: Vec3): number { return Math.sqrt(dot(a, a)); }
export function normalize(a: Vec3): Vec3 {
  const l = vlen(a);
  if (l === 0) throw new InvalidGeometryError('cannot normalize zero-length vector');
  return v3(a[0] / l, a[1] / l, a[2] / l);
}

const cm = (m: readonly number[]): Mat4 => m.map((n) => canonicalNumber(n));

export function matIdentity(): Mat4 { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
export function isIdentity(m: Mat4): boolean {
  return m.length === 16 && m.every((n, i) => n === (i % 5 === 0 ? 1 : 0));
}

export function matMul(a: Mat4, b: Mat4): Mat4 {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j];
      r[i * 4 + j] = s;
    }
  }
  return cm(r);
}

export function matTranslate(t: Vec3): Mat4 {
  return cm([1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1]);
}

export function matUniformScale(s: number): Mat4 {
  if (!(s > 0)) throw new InvalidGeometryError('uniform scale must be > 0');
  return cm([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
}

export function matRotateAboutAxis(axis: Vec3, angleRad: number, origin: Vec3): Mat4 {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const R = cm([
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ]);
  const to = matTranslate(origin);
  const from = matTranslate([-origin[0], -origin[1], -origin[2]]);
  return matMul(to, matMul(R, from));
}

/**
 * Trig-free exact rotation mapping +Z to `a` (Rodrigues with unnormalized
 * v = z x a). Only sqrt/arithmetic — stable across platforms; entries are
 * canonicalized to 12 significant digits.
 */
export function rotationFromZTo(a: Vec3): Mat4 {
  const n = normalize(a);
  const c = n[2];
  if (c > 1 - 1e-12) return matIdentity();
  if (c < -1 + 1e-12) return cm([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  const vx = -n[1];
  const vy = n[0];
  const vz = 0;
  const s2 = vx * vx + vy * vy + vz * vz;
  const k = 1 / (1 + c);
  const K = [
    [0, -vz, vy],
    [vz, 0, -vx],
    [-vy, vx, 0],
  ];
  const R: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const vi = i === 0 ? vx : i === 1 ? vy : vz;
      const vj = j === 0 ? vx : j === 1 ? vy : vz;
      const vvt = vi * vj;
      const v2term = vvt - (i === j ? s2 : 0);
      R.push((i === j ? 1 : 0) + K[i][j] + k * v2term);
    }
    R.push(0);
  }
  R.push(0, 0, 0, 1);
  return cm(R);
}

export function applyPoint(m: Mat4, p: Vec3): Vec3 {
  return v3(
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  );
}

export function applyDir(m: Mat4, d: Vec3): Vec3 {
  return v3(
    m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
    m[4] * d[0] + m[5] * d[1] + m[6] * d[2],
    m[8] * d[0] + m[9] * d[1] + m[10] * d[2],
  );
}

/** Inverse of a matrix of the form [sR | t] (rigid R, uniform scale s). */
export function invertRigidUniform(m: Mat4, s: number): Mat4 {
  if (!(s > 0)) throw new InvalidGeometryError('invertRigidUniform: scale must be > 0');
  const r = (i: number, j: number) => m[i * 4 + j] / s;
  const t = [m[3], m[7], m[11]];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i * 4 + j] = r(j, i) / s;
    out[i * 4 + 3] = -(r(0, i) * t[0] + r(1, i) * t[1] + r(2, i) * t[2]) / s;
  }
  out.push(0, 0, 0, 1);
  return cm(out);
}

/** True iff the 3x3 part of m equals s*I exactly (canonicalized entries). */
export function isScaledIdentityRotation(m: Mat4, s: number): boolean {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (m[i * 4 + j] !== (i === j ? s : 0)) return false;
    }
  }
  return true;
}

/** Deterministic orthonormal frame (u, v) perpendicular to `axis`. */
export function circleFrame(axis: Vec3): { u: Vec3; v: Vec3 } {
  const n = normalize(axis);
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  const ref: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  const u = normalize(cross(ref, n));
  const v = cross(n, u);
  return { u, v };
}
