/**
 * @zcode/epoch-gltf 公开契约：投递编译器类型 + 守卫。
 *
 * 依据 spec/work-orders/W010-gltf-delivery-pipeline.md + ARCHITECTURE-LOCK
 * #5（表现是投影）/ #10（glTF 是能力，不是语义权威）/ #16（核心引擎中立）
 * / #17（确定性）。本契约只定义 WorldPresentation → glTF/GLB 的「投递编译」接口；
 * 不定义反向导入（glTF → 世界状态）—— 那是未来契约的职责，本模块绝不越过投影边界。
 *
 * 零运行时依赖；仅类型 + 守卫，实现见 compiler.ts / representation-fabric.ts / glb.ts。
 */
import type { RepresentationRef } from "@zcode/epoch-world-presentation";

/** glTF 投递输出形态：glb = 自包含二进制容器（默认）；gltf = JSON + data-uri 内嵌 buffer。 */
export type GltfFormat = "glb" | "gltf";

/** glTF 2.0 原生基本图元模式（spec 表 mode 枚举；4=TRIANGLES, 1=LINES, 0=POINTS）。 */
export type GltfPrimitiveMode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** glTF 文档：松散结构（由 validation 测试中的手写 schema 校验，不在此绑定实现）。 */
export type GltfDocument = Readonly<Record<string, unknown>>;

/** 已解析几何载荷：投递编译器内部最小几何形态。 */
export interface ResolvedGeometry {
  /** 扁平 [x,y,z, ...]；长度必须是 3 的倍数。 */
  readonly positions: readonly number[];
  /** 可选索引；mode=4 时为顶点索引，mode=1 时为线段端点索引。 */
  readonly indices?: readonly number[];
  /** 可选法线（与 positions 等长 1:3）。 */
  readonly normals?: readonly number[];
  /** 缺省 4 (TRIANGLES)。 */
  readonly mode?: GltfPrimitiveMode;
}

/**
 * 表现引用解析器：把 RepresentationRef 解析为可编译的几何载荷。
 * 默认实现见 representation-fabric.ts（处理 epoch.box@1 / epoch.triangles@1 / epoch.linework@1）。
 * 返回 undefined 表示该引用无法解析——编译器记录到 unresolvedRepresentations，绝不静默丢弃。
 */
export type RepresentationResolver = (ref: RepresentationRef) => ResolvedGeometry | undefined;

/** 投递编译选项：format 缺省 glb；resolver 缺省使用内置内联解析器。 */
export interface GltfDeliveryOptions {
  readonly format?: GltfFormat;
  readonly resolver?: RepresentationResolver;
}

/** glTF 基本图元映射项：单个 RepresentationRef 在 glTF 中的位置。 */
export interface GltfMappingRepresentation {
  readonly presentationId: string;
  readonly representationId: string;
  readonly kind: string;
  readonly format: string;
  readonly gltfMeshIndex: number;
  readonly gltfPrimitiveIndex: number;
  /** true=已编译为 glTF 基本图元；false=未解析（见 unresolvedRepresentations）。 */
  readonly resolved: boolean;
}

/** glTF 节点映射项：单个 WorldPresentationNode 在 glTF 中的位置。 */
export interface GltfMappingEntry {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly visibility: string;
  readonly gltfNodeIndex: number;
  readonly representations: readonly GltfMappingRepresentation[];
}

/** 未解析的表现引用：编译器无法将其编译为 glTF 基本图元（保留追溯，绝不静默丢弃）。 */
export interface GltfUnresolvedRepresentation {
  readonly presentationId: string;
  readonly representationId: string;
  readonly kind: string;
  readonly format: string;
  readonly reason: string;
}

/** 稳定映射表：WorldPresentation → glTF 节点/基本图元的 1:1 映射 + 未解析项。 */
export interface GltfMappingTable {
  readonly worldId: string;
  readonly revisionId: string;
  readonly digest: string;
  readonly projectionMode: string;
  readonly nodes: readonly GltfMappingEntry[];
  readonly unresolvedRepresentations: readonly GltfUnresolvedRepresentation[];
}

/** 投递编译产物：glTF JSON 文档 + 可选 GLB 二进制 + 映射表 + 字节摘要。 */
export interface GltfArtifact {
  readonly format: GltfFormat;
  readonly json: GltfDocument;
  readonly glb?: Uint8Array;
  readonly mapping: GltfMappingTable;
  /** sha256(canonical bytes)：glb=GLB 字节，gltf=canonical JSON 串。 */
  readonly digest: string;
}

const GLTF_PRIMITIVE_MODES: readonly GltfPrimitiveMode[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 接受非负整数或 -1（unresolved 表现引用的哨兵值）。 */
function isMeshIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -1;
}

/** GltfFormat 守卫。 */
export function isGltfFormat(value: unknown): value is GltfFormat {
  return value === "glb" || value === "gltf";
}

/** GltfPrimitiveMode 守卫。 */
export function isGltfPrimitiveMode(value: unknown): value is GltfPrimitiveMode {
  return typeof value === "number" && GLTF_PRIMITIVE_MODES.includes(value as GltfPrimitiveMode);
}

/** GltfDeliveryOptions 守卫。 */
export function isGltfDeliveryOptions(value: unknown): value is GltfDeliveryOptions {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (c.format !== undefined && !isGltfFormat(c.format)) return false;
  if (c.resolver !== undefined && typeof c.resolver !== "function") return false;
  return true;
}

function isGltfMappingRepresentation(value: unknown): value is GltfMappingRepresentation {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.presentationId !== "string" || c.presentationId.length === 0) return false;
  if (typeof c.representationId !== "string" || c.representationId.length === 0) return false;
  if (typeof c.kind !== "string" || c.kind.length === 0) return false;
  if (typeof c.format !== "string" || c.format.length === 0) return false;
  if (!isMeshIndex(c.gltfMeshIndex)) return false;
  if (!isMeshIndex(c.gltfPrimitiveIndex)) return false;
  if (typeof c.resolved !== "boolean") return false;
  return true;
}

function isGltfMappingEntry(value: unknown): value is GltfMappingEntry {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.presentationId !== "string" || c.presentationId.length === 0) return false;
  if (!isOptionalString(c.entityId)) return false;
  if (!isOptionalString(c.parentPresentationId)) return false;
  if (typeof c.visibility !== "string" || c.visibility.length === 0) return false;
  if (!isNonNegInt(c.gltfNodeIndex)) return false;
  if (!Array.isArray(c.representations)) return false;
  if (!c.representations.every(isGltfMappingRepresentation)) return false;
  return true;
}

function isGltfUnresolvedRepresentation(value: unknown): value is GltfUnresolvedRepresentation {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.presentationId !== "string" || c.presentationId.length === 0) return false;
  if (typeof c.representationId !== "string" || c.representationId.length === 0) return false;
  if (typeof c.kind !== "string" || c.kind.length === 0) return false;
  if (typeof c.format !== "string" || c.format.length === 0) return false;
  if (typeof c.reason !== "string" || c.reason.length === 0) return false;
  return true;
}

/** GltfMappingTable 守卫。 */
export function isGltfMappingTable(value: unknown): value is GltfMappingTable {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.worldId !== "string" || c.worldId.length === 0) return false;
  if (typeof c.revisionId !== "string" || c.revisionId.length === 0) return false;
  if (typeof c.digest !== "string" || c.digest.length === 0) return false;
  if (typeof c.projectionMode !== "string" || c.projectionMode.length === 0) return false;
  if (!Array.isArray(c.nodes) || !c.nodes.every(isGltfMappingEntry)) return false;
  if (!Array.isArray(c.unresolvedRepresentations)) return false;
  if (!c.unresolvedRepresentations.every(isGltfUnresolvedRepresentation)) return false;
  return true;
}

/** GltfArtifact 守卫。 */
export function isGltfArtifact(value: unknown): value is GltfArtifact {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (!isGltfFormat(c.format)) return false;
  if (typeof c.json !== "object" || c.json === null) return false;
  if (c.glb !== undefined && !(c.glb instanceof Uint8Array)) return false;
  if (!isGltfMappingTable(c.mapping)) return false;
  if (typeof c.digest !== "string" || c.digest.length === 0) return false;
  return true;
}
