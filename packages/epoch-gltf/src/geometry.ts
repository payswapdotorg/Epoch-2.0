/**
 * @zcode/epoch-gltf 几何/材质/节点辅助：字节编码、buffer 装配、min/max、
 * 材质预设、TRS 抽取、表现引用解析包装。
 *
 * 内部辅助（非公开出口）；确定性、网络无依赖。
 */
import type { WorldPresentationNode, RepresentationRef } from "@zcode/epoch-world-presentation";
import type { RepresentationResolver, ResolvedGeometry } from "./contract.ts";
import { EPOCH_EXTRAS_KEY } from "./mapping.ts";

export interface BufferSlice {
  readonly data: Uint8Array;
  readonly target: number;
}

export interface AccessorSpec {
  readonly bufferViewIndex: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

export interface MeshPrimitiveSpec {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material: number;
  readonly mode?: number;
  readonly extras: Record<string, unknown>;
}

export interface MeshSpec {
  readonly primitives: readonly MeshPrimitiveSpec[];
}

export interface NodeSpec {
  readonly name: string;
  readonly mesh?: number;
  readonly translation: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly children: number[];
  readonly extras: Record<string, unknown>;
}

export const GLTF_COMPONENT_UNSIGNED_SHORT = 5123;
export const GLTF_COMPONENT_FLOAT = 5126;
export const GLTF_TARGET_ELEMENT_ARRAY_BUFFER = 34963;
export const GLTF_TARGET_ARRAY_BUFFER = 34962;

/** Float32 数组 → little-endian 字节流。 */
export function float32ToBytes(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i]!, true);
  return out;
}

/** Uint16 数组 → little-endian 字节流。 */
export function uint16ToBytes(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < values.length; i++) view.setUint16(i * 2, values[i]!, true);
  return out;
}

/** 连接字节切片（无 padding）。 */
export function concatBytes(slices: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const s of slices) total += s.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const s of slices) {
    out.set(s, off);
    off += s.length;
  }
  return out;
}

/** 计算到 4 字节对齐需要的 padding 字节数。 */
export function pad4(n: number): number {
  const rem = n % 4;
  return rem === 0 ? 0 : 4 - rem;
}

/** 计算扁平 [x,y,z, ...] 的 min/max（每 3 个一组）。 */
export function computeMinMax(values: readonly number[]): { min: number[]; max: number[] } {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i]!;
    const y = values[i + 1]!;
    const z = values[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

const KIND_MATERIALS: Readonly<
  Record<string, { name: string; baseColor: readonly [number, number, number, number] }>
> = {
  solid: { name: "epoch-solid", baseColor: [0.75, 0.72, 0.68, 1] },
  mesh: { name: "epoch-mesh", baseColor: [0.62, 0.66, 0.7, 1] },
  "point-cloud": { name: "epoch-point-cloud", baseColor: [0.5, 0.5, 0.55, 1] },
  linework: { name: "epoch-linework", baseColor: [0.1, 0.1, 0.1, 1] },
  "annotation-anchor": { name: "epoch-annotation-anchor", baseColor: [0.85, 0.55, 0.2, 1] },
  "plan-symbol": { name: "epoch-plan-symbol", baseColor: [0.3, 0.3, 0.3, 1] },
  "section-cut": { name: "epoch-section-cut", baseColor: [0.9, 0.4, 0.4, 1] },
  "generated-proxy": { name: "epoch-generated-proxy", baseColor: [0.45, 0.6, 0.55, 1] },
};

/** 按 representation kind 构建一个 PBR 材质（确定性：首个出现的 kind 决定索引）。 */
export function materialForKind(kind: string, kindIndex: number): Record<string, unknown> {
  const preset = KIND_MATERIALS[kind] ?? {
    name: `epoch-unknown-${kindIndex}`,
    baseColor: [0.5, 0.5, 0.5, 1] as const,
  };
  return {
    name: preset.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...preset.baseColor],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  };
}

/** 抽取 WorldPresentationNode 的 TRS 字段（缺省 rotation/scale 省略，glTF 视为单位变换）。 */
export function buildTransformFields(node: WorldPresentationNode): {
  translation: readonly [number, number, number];
  rotation?: readonly [number, number, number, number];
  scale?: readonly [number, number, number];
} {
  const t = node.transform.translation;
  const translation: readonly [number, number, number] = [t.x, t.y, t.z];
  let rotation: readonly [number, number, number, number] | undefined;
  if (node.transform.rotation) {
    const r = node.transform.rotation;
    rotation = [r.x, r.y, r.z, r.w];
  }
  let scale: readonly [number, number, number] | undefined;
  if (node.transform.scale) {
    const s = node.transform.scale;
    scale = [s.x, s.y, s.z];
  }
  return { translation, rotation, scale };
}

/** 包装 resolver 调用，捕获异常 → 转为 unresolved。 */
export function resolveRep(
  rep: RepresentationRef,
  resolver: RepresentationResolver,
): { geometry: ResolvedGeometry } | { unresolved: true; reason: string } {
  let geometry: ResolvedGeometry | undefined;
  try {
    geometry = resolver(rep);
  } catch (err) {
    return { unresolved: true, reason: `resolver threw: ${(err as Error).message}` };
  }
  if (geometry === undefined) {
    return { unresolved: true, reason: `unsupported format: ${rep.format}` };
  }
  return { geometry };
}

/** 在已构建的 meshes 列表中找到属于某 presentationId 的 mesh 索引。 */
export function findMeshForNode(
  node: WorldPresentationNode,
  meshes: readonly MeshSpec[],
): number | undefined {
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (!mesh) continue;
    const prim = mesh.primitives[0];
    if (!prim) continue;
    const extras = prim.extras as Record<string, unknown> | undefined;
    if (!extras) continue;
    const epoch = extras[EPOCH_EXTRAS_KEY] as { presentationId?: string } | undefined;
    if (epoch && epoch.presentationId === node.presentationId) return i;
  }
  return undefined;
}
