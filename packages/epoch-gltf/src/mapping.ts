/**
 * @zcode/epoch-gltf 稳定映射律：extras.epoch 命名空间 schema + 反向提取器。
 *
 * 依据 ARCHITECTURE-LOCK #11（选择是语义的：presentationId → node → entityId 解析）
 * + W010 稳定映射律：每个 glTF 节点/基本图元携带 presentationId（及已知时的 entityId）
 * 在 extras 里；round-trip 验证必须证明映射 1:1（无丢弃、无重命名、跨重复编译稳定）。
 *
 * extras.epoch 命名空间（避免与第三方扩展冲突）：
 * - scene root extras.epoch = { worldId, revisionId, digest, projectionMode }
 * - 每个 node extras.epoch = { presentationId, entityId?, parentPresentationId?,
 *   layerIds, selectable, focusable, visibility }
 * - 每个 primitive extras.epoch = { presentationId, representationId, kind, format }
 */
import type {
  GltfDocument,
  GltfMappingTable,
  GltfMappingEntry,
  GltfMappingRepresentation,
  GltfUnresolvedRepresentation,
} from "./contract.ts";
import type {
  WorldPresentation,
  WorldPresentationNode,
  RepresentationRef,
} from "@zcode/epoch-world-presentation";

export const EPOCH_EXTRAS_KEY = "epoch";

/** scene root extras.epoch schema。 */
export function buildSceneExtras(p: WorldPresentation): Record<string, unknown> {
  return {
    worldId: p.worldId,
    revisionId: p.revisionId,
    digest: p.digest,
    projectionMode: p.projectionMode,
  };
}

/** 节点 extras.epoch schema（保留 presentationId/entityId/parentPresentationId/层/可见）。 */
export function buildNodeExtras(node: WorldPresentationNode): Record<string, unknown> {
  const e: Record<string, unknown> = {
    presentationId: node.presentationId,
    layerIds: [...node.interaction.layerIds],
    selectable: node.interaction.selectable,
    focusable: node.interaction.focusable,
    visibility: node.visibility,
  };
  if (node.entityId !== undefined) e.entityId = node.entityId;
  if (node.parentPresentationId !== undefined) e.parentPresentationId = node.parentPresentationId;
  return e;
}

/** 基本图元 extras.epoch schema（保留 representationId/kind/format）。 */
export function buildPrimitiveExtras(
  node: WorldPresentationNode,
  rep: RepresentationRef,
): Record<string, unknown> {
  return {
    presentationId: node.presentationId,
    representationId: rep.representationId,
    kind: rep.kind,
    format: rep.format,
  };
}

export interface EpochSceneExtras {
  readonly worldId: string;
  readonly revisionId: string;
  readonly digest: string;
  readonly projectionMode: string;
}

export interface EpochNodeExtras {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly layerIds: readonly string[];
  readonly selectable: boolean;
  readonly focusable: boolean;
  readonly visibility: string;
}

export interface EpochPrimitiveExtras {
  readonly presentationId: string;
  readonly representationId: string;
  readonly kind: string;
  readonly format: string;
}

/** 从 glTF 文档反向提取映射表——证明 extras 保留了 1:1 映射（round-trip 校验用）。 */
export function extractMappingFromDocument(doc: GltfDocument): GltfMappingTable | null {
  const scenes = doc.scenes as readonly { extras?: Record<string, unknown> }[] | undefined;
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  const root = scenes[0]?.extras?.[EPOCH_EXTRAS_KEY];
  if (typeof root !== "object" || root === null) return null;
  const r = root as EpochSceneExtras;
  if (
    typeof r.worldId !== "string" ||
    typeof r.revisionId !== "string" ||
    typeof r.digest !== "string" ||
    typeof r.projectionMode !== "string"
  ) {
    return null;
  }
  const nodes = doc.nodes as
    | readonly { extras?: Record<string, unknown>; children?: readonly number[]; mesh?: number }[]
    | undefined;
  if (!Array.isArray(nodes)) return null;
  const meshes = (doc.meshes ?? []) as readonly {
    primitives: readonly { extras?: Record<string, unknown> }[];
  }[];
  const entries: GltfMappingEntry[] = [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    const ne = node?.extras?.[EPOCH_EXTRAS_KEY];
    if (typeof ne !== "object" || ne === null) continue;
    const nx = ne as EpochNodeExtras;
    if (typeof nx.presentationId !== "string" || nx.presentationId.length === 0) continue;
    const reps: GltfMappingRepresentation[] = [];
    if (typeof node?.mesh === "number") {
      const meshEntry = meshes[node.mesh];
      if (meshEntry && Array.isArray(meshEntry.primitives)) {
        const prims = meshEntry.primitives;
        for (let pi = 0; pi < prims.length; pi++) {
          const prim = prims[pi];
          if (!prim || !prim.extras) continue;
          const pe = (prim.extras as Record<string, unknown>)[EPOCH_EXTRAS_KEY] as
            | EpochPrimitiveExtras
            | undefined;
          if (!pe) continue;
          reps.push({
            presentationId: pe.presentationId,
            representationId: pe.representationId,
            kind: pe.kind,
            format: pe.format,
            gltfMeshIndex: node.mesh,
            gltfPrimitiveIndex: pi,
            resolved: true,
          });
        }
      }
    }
    entries.push({
      presentationId: nx.presentationId,
      ...(nx.entityId !== undefined ? { entityId: nx.entityId } : {}),
      ...(nx.parentPresentationId !== undefined
        ? { parentPresentationId: nx.parentPresentationId }
        : {}),
      visibility: nx.visibility,
      gltfNodeIndex: ni,
      representations: reps,
    });
  }
  // unresolvedRepresentations 是从外部映射表来的——文档里不编码（编译器记录）。
  // 反向提取时返回空数组（这字段在 round-trip 校验中由调用方比对）。
  const unresolved: GltfUnresolvedRepresentation[] = [];
  return {
    worldId: r.worldId,
    revisionId: r.revisionId,
    digest: r.digest,
    projectionMode: r.projectionMode,
    nodes: entries,
    unresolvedRepresentations: unresolved,
  };
}
