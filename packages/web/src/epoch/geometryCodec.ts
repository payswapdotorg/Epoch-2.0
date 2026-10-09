/**
 * 构造 fixture 几何种子 -> 渲染器中立表现引用（renderer-neutral RepresentationRef）。
 *
 * 依据 ARCHITECTURE-LOCK #5/#6：表现是投影，渲染器中立；几何作为「数据」携带。
 * W004 Babylon 表现织构（representation-fabric.ts）识别三种内建格式：
 *   epoch.box@1        { sizeX, sizeY, sizeZ }
 *   epoch.triangles@1  { positions, indices? }（非索引汤需 %9==0）
 *   epoch.linework@1   { points }（%3==0 且 >0）
 *
 * 本编解码把 fixture 的五种 GeometryKind 原语映射到上述内建格式，全部为纯数值
 * JSON 文本（ref 字段），确定性——相同种子恒产生相同表现引用。不携带 mesh/
 * scene-node；表现身份在表现节点层（fixturePresentation.ts）绑定 entityId。
 */
import type { GeometrySeed } from "@zcode/epoch-construction-fixture";
import type { RepresentationKind, RepresentationRef } from "@zcode/epoch-world-presentation";

const BOX_FORMAT = "epoch.box@1";
const TRIANGLES_FORMAT = "epoch.triangles@1";

/** 给定种子的确定性表现引用计数（每种 1 个，保持可读与确定性）。 */
export function representationCount(): number {
  return 1;
}

/** 把单个表现引用编码为 epoch.box@1 的 ref JSON。 */
function boxRef(sizeX: number, sizeY: number, sizeZ: number): string {
  return JSON.stringify({ sizeX, sizeY, sizeZ });
}

/** 把单个表现引用编码为 epoch.triangles@1 的 ref JSON（索引几何）。 */
function trianglesRef(positions: readonly number[], indices: readonly number[]): string {
  return JSON.stringify({ positions, indices });
}

/** 单位四元数（无旋转）。 */
export function identityQuaternion(): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/**
 * 欧拉角（度，[rx, ry, rz]）-> 四元数（Tait-Bryan，intrinsic ZYX）。
 * 单轴旋转与任意约定一致；多轴采用航空常用 ZYX 内旋顺序。
 */
export function eulerDegToQuaternion(
  rxDeg: number,
  ryDeg: number,
  rzDeg: number,
): { x: number; y: number; z: number; w: number } {
  const rx = (rxDeg * Math.PI) / 180 / 2;
  const ry = (ryDeg * Math.PI) / 180 / 2;
  const rz = (rzDeg * Math.PI) / 180 / 2;
  const cr = Math.cos(rx);
  const sr = Math.sin(rx);
  const cp = Math.cos(ry);
  const sp = Math.sin(ry);
  const cy = Math.cos(rz);
  const sy = Math.sin(rz);
  return {
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    w: cr * cp * cy + sr * sp * sy,
  };
}

/**
 * 生成 N 边圆柱的索引三角网格（轴沿 +Y，本地原点居中，高度 h，半径 r）。
 * 顶点：底环 N + 顶环 N；索引：侧面 2*N 三角 + 底盖 N-2 + 顶盖 N-2。
 * 确定性：固定 N=14，相同 (r,h) 恒产生同一 positions/indices。
 */
function cylinderMesh(
  radius: number,
  height: number,
  sides: number,
): { positions: number[]; indices: number[] } {
  const r = Math.max(radius, 1e-4);
  const h = Math.max(height, 1e-4);
  const half = h / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    positions.push(x, -half, z); // 底环
    positions.push(x, half, z); // 顶环
  }
  const bottomBase = 0;
  const topBase = sides * 2;
  positions.push(0, -half, 0); // 底心
  positions.push(0, half, 0); // 顶心
  const bottomCenter = sides * 2;
  const topCenter = sides * 2 + 1;
  for (let i = 0; i < sides; i += 1) {
    const a0 = i * 2;
    const a1 = ((i + 1) % sides) * 2;
    const b0 = a0 + 1;
    const b1 = a1 + 1;
    // 侧面（两个三角形，外法向朝外）
    indices.push(a0, a1, b1);
    indices.push(a0, b1, b0);
    // 底盖（绕底心，法向 -Y）
    indices.push(bottomCenter, a1, a0);
    // 顶盖（绕顶心，法向 +Y）
    indices.push(topCenter, b0, b1);
  }
  void bottomBase;
  void topBase;
  return { positions, indices };
}

/** 把单个几何种子映射为一条渲染器中立表现引用。 */
export function representationForSeed(
  seed: GeometrySeed,
  representationId: string,
): RepresentationRef {
  const kind: RepresentationKind = "solid";
  if (seed.kind === "box") {
    const [sizeX = 0, sizeY = 0, sizeZ = 0] = seed.size;
    return {
      representationId,
      kind,
      format: BOX_FORMAT,
      ref: boxRef(Math.max(sizeX, 1e-4), Math.max(sizeY, 1e-4), Math.max(sizeZ, 1e-4)),
    };
  }
  if (seed.kind === "cylinder") {
    const [radius = 0, height = 0] = seed.size;
    const { positions, indices } = cylinderMesh(radius, height, 14);
    return {
      representationId,
      kind,
      format: TRIANGLES_FORMAT,
      ref: trianglesRef(positions, indices),
    };
  }
  if (seed.kind === "plane") {
    const [width = 0, length = 0] = seed.size;
    return {
      representationId,
      kind,
      format: BOX_FORMAT,
      ref: boxRef(Math.max(width, 1e-4), 0.05, Math.max(length, 1e-4)),
    };
  }
  if (seed.kind === "line") {
    const [length = 0, diameter = 0] = seed.size;
    const thickness = Math.max(diameter, 0.06);
    return {
      representationId,
      kind,
      format: BOX_FORMAT,
      ref: boxRef(Math.max(length, 1e-4), thickness, thickness),
    };
  }
  // point：以小立方体占位（fixture 当前内容未使用 point；保留完整映射）。
  return {
    representationId,
    kind,
    format: BOX_FORMAT,
    ref: boxRef(0.1, 0.1, 0.1),
  };
}
