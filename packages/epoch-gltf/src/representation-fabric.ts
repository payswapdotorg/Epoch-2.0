/**
 * @zcode/epoch-gltf 默认内联表现引用解析器。
 *
 * 处理 epoch 自描述的内联载荷格式（与 W004 babylon fabric 的 box/triangles/linework 同形）：
 * - epoch.box@1：ref = JSON { sizeX, sizeY, sizeZ } → 24 顶点立方体（positions + normals + indices）。
 * - epoch.triangles@1：ref = JSON { positions: [[x,y,z],...], indices?: [...] } → 扁平化，mode=4。
 * - epoch.linework@1：ref = JSON { segments: [[x,y,z, x,y,z], ...] } → 扁平线段流，mode=1。
 *
 * 未知格式返回 undefined——编译器记录到 unresolvedRepresentations（绝不静默丢弃）。
 * 本文件是确定的、网络无依赖的；仅用 JSON.parse + 算术。
 */
import type { RepresentationRef } from "@zcode/epoch-world-presentation";
import type { ResolvedGeometry } from "./contract.ts";

export const EPOCH_BOX_FORMAT = "epoch.box@1";
export const EPOCH_TRIANGLES_FORMAT = "epoch.triangles@1";
export const EPOCH_LINEWORK_FORMAT = "epoch.linework@1";

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isFinite(v));
}

function isFiniteTriplet(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

/** 解析 epoch.box@1：ref = JSON { sizeX, sizeY, sizeZ }。 */
function resolveBox(ref: string): ResolvedGeometry | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(ref);
  } catch {
    return undefined;
  }
  if (typeof payload !== "object" || payload === null) return undefined;
  const c = payload as Record<string, unknown>;
  if (!isFiniteTriplet([c.sizeX, c.sizeY, c.sizeZ])) return undefined;
  const [sx, sy, sz] = [c.sizeX as number, c.sizeY as number, c.sizeZ as number];
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  // 8 corners → 24 verts (4 per face × 6 faces) for per-face normals.
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  // 6 faces × 4 verts × 2 triangles. Corner indices + per-face outward normal.
  const faceDefs: ReadonlyArray<{
    corners: readonly [number, number, number, number];
    normal: readonly [number, number, number];
  }> = [
    { corners: [0, 3, 2, 1], normal: [0, 0, -1] }, // -Z
    { corners: [4, 5, 6, 7], normal: [0, 0, 1] }, // +Z
    { corners: [0, 4, 7, 3], normal: [-1, 0, 0] }, // -X
    { corners: [1, 2, 6, 5], normal: [1, 0, 0] }, // +X
    { corners: [0, 1, 5, 4], normal: [0, -1, 0] }, // -Y
    { corners: [3, 7, 6, 2], normal: [0, 1, 0] }, // +Y
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let v = 0;
  for (const face of faceDefs) {
    for (const ci of face.corners) {
      const corner = corners[ci];
      if (!corner) continue;
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    // Two triangles: (0,1,2) and (0,2,3) within this 4-vert fan.
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  return { positions, normals, indices, mode: 4 };
}

/** 解析 epoch.triangles@1：ref = JSON { positions: [[x,y,z],...], indices?: [...] }。 */
function resolveTriangles(ref: string): ResolvedGeometry | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(ref);
  } catch {
    return undefined;
  }
  if (typeof payload !== "object" || payload === null) return undefined;
  const c = payload as Record<string, unknown>;
  if (!Array.isArray(c.positions)) return undefined;
  const positions: number[] = [];
  for (const p of c.positions) {
    if (!isFiniteTriplet(p)) return undefined;
    positions.push(p[0], p[1], p[2]);
  }
  let indices: number[] | undefined;
  if (c.indices !== undefined) {
    if (!isFiniteNumberArray(c.indices)) return undefined;
    indices = c.indices;
  }
  return { positions, indices, mode: 4 };
}

/** 解析 epoch.linework@1：ref = JSON { segments: [[x,y,z, x,y,z], ...] }。 */
function resolveLinework(ref: string): ResolvedGeometry | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(ref);
  } catch {
    return undefined;
  }
  if (typeof payload !== "object" || payload === null) return undefined;
  const c = payload as Record<string, unknown>;
  if (!Array.isArray(c.segments)) return undefined;
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  for (const seg of c.segments) {
    if (!Array.isArray(seg) || seg.length !== 6) return undefined;
    if (!isFiniteNumberArray(seg)) return undefined;
    positions.push(seg[0]!, seg[1]!, seg[2]!, seg[3]!, seg[4]!, seg[5]!);
    indices.push(vi, vi + 1);
    vi += 2;
  }
  return { positions, indices, mode: 1 };
}

/**
 * 默认内联表现引用解析器：处理 epoch.box@1 / epoch.triangles@1 / epoch.linework@1。
 * 未知格式返回 undefined（编译器记录到 unresolvedRepresentations）。
 */
export function resolveInlinedRepresentation(ref: RepresentationRef): ResolvedGeometry | undefined {
  if (typeof ref.ref !== "string" || ref.ref.length === 0) return undefined;
  switch (ref.format) {
    case EPOCH_BOX_FORMAT:
      return resolveBox(ref.ref);
    case EPOCH_TRIANGLES_FORMAT:
      return resolveTriangles(ref.ref);
    case EPOCH_LINEWORK_FORMAT:
      return resolveLinework(ref.ref);
    default:
      return undefined;
  }
}
