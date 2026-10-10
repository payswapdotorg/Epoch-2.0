/**
 * @zcode/epoch-gltf 投递编译器：WorldPresentation → glTF 2.0 / GLB。
 *
 * 纯投影（ARCHITECTURE-LOCK #5）：消费冻结的 WorldPresentation，输出 glTF 文档 + GLB 二进制。
 * 不解析 glTF 回世界状态（#10 边界——未来导入能力在自有契约之后）。
 *
 * 稳定映射律（#11）：每个 glTF 节点/基本图元在 extras.epoch 携带 presentationId/entityId
 * （见 mapping.ts）；round-trip 提取器证明 1:1 保留。
 *
 * 确定性（#17）：节点顺序 = 输入顺序；buffer 顺序 = 节点→表现→(positions→normals→indices)；
 * JSON key 顺序由 canonicalJsonStringify 排序；无时间戳/随机。同输入 → 字节相同。
 *
 * 网络无依赖：仅用 JSON.parse + 算术 + node:crypto 摘要；不含 glTF 解析库。
 */
import type {
  GltfArtifact,
  GltfDeliveryOptions,
  GltfDocument,
  GltfFormat,
  GltfMappingEntry,
  GltfMappingRepresentation,
  GltfMappingTable,
  GltfUnresolvedRepresentation,
  RepresentationResolver,
} from "./contract.ts";
import { isGltfDeliveryOptions } from "./contract.ts";
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import { isWorldPresentation } from "@zcode/epoch-world-presentation";
import { resolveInlinedRepresentation } from "./representation-fabric.ts";
import {
  EPOCH_EXTRAS_KEY,
  buildNodeExtras,
  buildPrimitiveExtras,
  buildSceneExtras,
  extractMappingFromDocument,
} from "./mapping.ts";
import { encodeGlb } from "./glb.ts";
import { canonicalJsonStringify, sha256Digest } from "./determinism.ts";
import {
  type BufferSlice,
  type AccessorSpec,
  type MeshSpec,
  type NodeSpec,
  GLTF_COMPONENT_FLOAT,
  GLTF_COMPONENT_UNSIGNED_SHORT,
  GLTF_TARGET_ARRAY_BUFFER,
  GLTF_TARGET_ELEMENT_ARRAY_BUFFER,
  buildTransformFields,
  computeMinMax,
  concatBytes,
  findMeshForNode,
  float32ToBytes,
  materialForKind,
  pad4,
  resolveRep,
  uint16ToBytes,
} from "./geometry.ts";

/**
 * 编译 WorldPresentation → glTF 2.0 / GLB。确定性、网络无依赖。
 * format 缺省 glb；resolver 缺省使用内置 resolveInlinedRepresentation。
 */
export function compilePresentationToGltf(
  presentation: WorldPresentation,
  options?: GltfDeliveryOptions,
): GltfArtifact {
  if (!isWorldPresentation(presentation)) {
    throw new Error("compilePresentationToGltf: input is not a valid WorldPresentation");
  }
  if (options !== undefined && !isGltfDeliveryOptions(options)) {
    throw new Error("compilePresentationToGltf: options is not a valid GltfDeliveryOptions");
  }
  const format: GltfFormat = options?.format ?? "glb";
  const resolver: RepresentationResolver = options?.resolver ?? resolveInlinedRepresentation;

  const slices: BufferSlice[] = [];
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: AccessorSpec[] = [];
  const meshes: MeshSpec[] = [];
  const materials: Record<string, unknown>[] = [];
  const materialByKind = new Map<string, number>();
  const mappingEntries: GltfMappingEntry[] = [];
  const unresolved: GltfUnresolvedRepresentation[] = [];

  let ni = 0;
  for (const node of presentation.nodes) {
    const mappingReps: GltfMappingRepresentation[] = [];
    const primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material: number;
      mode?: number;
      extras: Record<string, unknown>;
    }[] = [];
    let ri = 0;
    for (const rep of node.representations) {
      const resolved = resolveRep(rep, resolver);
      if ("unresolved" in resolved) {
        unresolved.push({
          presentationId: node.presentationId,
          representationId: rep.representationId,
          kind: rep.kind,
          format: rep.format,
          reason: resolved.reason,
        });
        mappingReps.push({
          presentationId: node.presentationId,
          representationId: rep.representationId,
          kind: rep.kind,
          format: rep.format,
          gltfMeshIndex: -1,
          gltfPrimitiveIndex: -1,
          resolved: false,
        });
        ri++;
        continue;
      }
      const g = resolved.geometry;
      if (!materialByKind.has(rep.kind)) {
        materialByKind.set(rep.kind, materials.length);
        materials.push(materialForKind(rep.kind, materialByKind.size));
      }
      const materialIndex = materialByKind.get(rep.kind)!;
      const attributes: Record<string, number> = {};
      // POSITION
      const posBytes = float32ToBytes(g.positions);
      const posView = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: 0,
        byteLength: posBytes.length,
        target: GLTF_TARGET_ARRAY_BUFFER,
      });
      slices.push({ data: posBytes, target: GLTF_TARGET_ARRAY_BUFFER });
      const posAcc = accessors.length;
      const mm = computeMinMax(g.positions);
      accessors.push({
        bufferViewIndex: posView,
        componentType: GLTF_COMPONENT_FLOAT,
        count: g.positions.length / 3,
        type: "VEC3",
        min: mm.min,
        max: mm.max,
      });
      attributes.POSITION = posAcc;
      // NORMAL (optional)
      if (g.normals && g.normals.length > 0) {
        const nBytes = float32ToBytes(g.normals);
        const nView = bufferViews.length;
        bufferViews.push({
          buffer: 0,
          byteOffset: 0,
          byteLength: nBytes.length,
          target: GLTF_TARGET_ARRAY_BUFFER,
        });
        slices.push({ data: nBytes, target: GLTF_TARGET_ARRAY_BUFFER });
        const nAcc = accessors.length;
        accessors.push({
          bufferViewIndex: nView,
          componentType: GLTF_COMPONENT_FLOAT,
          count: g.normals.length / 3,
          type: "VEC3",
        });
        attributes.NORMAL = nAcc;
      }
      // INDICES (optional)
      let indicesAcc: number | undefined;
      if (g.indices && g.indices.length > 0) {
        const iBytes = uint16ToBytes(g.indices);
        const iView = bufferViews.length;
        bufferViews.push({
          buffer: 0,
          byteOffset: 0,
          byteLength: iBytes.length,
          target: GLTF_TARGET_ELEMENT_ARRAY_BUFFER,
        });
        slices.push({ data: iBytes, target: GLTF_TARGET_ELEMENT_ARRAY_BUFFER });
        indicesAcc = accessors.length;
        accessors.push({
          bufferViewIndex: iView,
          componentType: GLTF_COMPONENT_UNSIGNED_SHORT,
          count: g.indices.length,
          type: "SCALAR",
        });
      }
      const meshIndex = meshes.length;
      primitives.push({
        attributes,
        ...(indicesAcc !== undefined ? { indices: indicesAcc } : {}),
        material: materialIndex,
        ...(g.mode !== undefined && g.mode !== 4 ? { mode: g.mode } : {}),
        extras: { [EPOCH_EXTRAS_KEY]: buildPrimitiveExtras(node, rep) },
      });
      mappingReps.push({
        presentationId: node.presentationId,
        representationId: rep.representationId,
        kind: rep.kind,
        format: rep.format,
        gltfMeshIndex: meshIndex,
        gltfPrimitiveIndex: primitives.length - 1,
        resolved: true,
      });
      ri++;
    }
    if (primitives.length > 0) {
      meshes.push({ primitives });
    }
    mappingEntries.push({
      presentationId: node.presentationId,
      ...(node.entityId !== undefined ? { entityId: node.entityId } : {}),
      ...(node.parentPresentationId !== undefined
        ? { parentPresentationId: node.parentPresentationId }
        : {}),
      visibility: node.visibility,
      gltfNodeIndex: ni,
      representations: mappingReps,
    });
    ni++;
  }

  // 装配 binary buffer：按 slices 顺序连接，4 字节对齐 padding。
  const binaryParts: Uint8Array[] = [];
  const byteOffsets: number[] = [];
  let cursor = 0;
  for (const s of slices) {
    if (cursor % 4 !== 0) {
      const pad = pad4(cursor);
      binaryParts.push(new Uint8Array(pad));
      cursor += pad;
    }
    byteOffsets.push(cursor);
    binaryParts.push(s.data);
    cursor += s.data.length;
  }
  // 回填 bufferViews 的 byteOffset（slices 与 bufferViews 一一对应）。
  for (let i = 0; i < bufferViews.length; i++) {
    const bv = bufferViews[i];
    if (!bv) continue;
    bv.byteOffset = byteOffsets[i] ?? 0;
  }
  const binaryBuffer = concatBytes(binaryParts);

  // 构建 nodes：保留输入顺序；parentPresentationId 决定 children。
  const presentationIdToIndex = new Map<string, number>();
  let idx = 0;
  for (const node of presentation.nodes) {
    presentationIdToIndex.set(node.presentationId, idx);
    idx++;
  }
  const nodeSpecs: NodeSpec[] = [];
  for (const node of presentation.nodes) {
    const tf = buildTransformFields(node);
    const meshIndex = meshes.length > 0 ? findMeshForNode(node, meshes) : undefined;
    nodeSpecs.push({
      name: `node-${presentationIdToIndex.get(node.presentationId) ?? 0}`,
      ...(meshIndex !== undefined ? { mesh: meshIndex } : {}),
      translation: tf.translation,
      ...(tf.rotation !== undefined ? { rotation: tf.rotation } : {}),
      ...(tf.scale !== undefined ? { scale: tf.scale } : {}),
      children: [],
      extras: { [EPOCH_EXTRAS_KEY]: buildNodeExtras(node) },
    });
  }
  const rootIndices: number[] = [];
  let nIdx = 0;
  for (const node of presentation.nodes) {
    if (node.parentPresentationId !== undefined) {
      const parentIdx = presentationIdToIndex.get(node.parentPresentationId);
      if (parentIdx !== undefined) {
        const parent = nodeSpecs[parentIdx];
        if (parent) (parent.children as number[]).push(nIdx);
        else rootIndices.push(nIdx);
      } else {
        rootIndices.push(nIdx);
      }
    } else {
      rootIndices.push(nIdx);
    }
    nIdx++;
  }

  // 装配 glTF JSON 文档。
  const buffers: Record<string, unknown>[] = [{ byteLength: binaryBuffer.length }];
  if (format === "gltf") {
    const b64 = Buffer.from(binaryBuffer).toString("base64");
    (buffers[0] as { uri?: string }).uri = `data:application/octet-stream;base64,${b64}`;
  }
  const doc: Record<string, unknown> = {
    asset: { version: "2.0", generator: "epoch-gltf" },
    scene: 0,
    scenes: [
      { nodes: rootIndices, extras: { [EPOCH_EXTRAS_KEY]: buildSceneExtras(presentation) } },
    ],
    nodes: nodeSpecs.map((ns) => {
      const o: Record<string, unknown> = {
        name: ns.name,
        translation: [...ns.translation],
        ...(ns.rotation !== undefined ? { rotation: [...ns.rotation] } : {}),
        ...(ns.scale !== undefined ? { scale: [...ns.scale] } : {}),
        ...(ns.mesh !== undefined ? { mesh: ns.mesh } : {}),
        ...(ns.children.length > 0 ? { children: [...ns.children] } : {}),
        extras: ns.extras,
      };
      return o;
    }),
    meshes: meshes.map((m) => ({
      primitives: m.primitives.map((p) => {
        const po: Record<string, unknown> = {
          attributes: { ...p.attributes },
          material: p.material,
          ...(p.mode !== undefined ? { mode: p.mode } : {}),
          extras: p.extras,
        };
        return po;
      }),
    })),
    materials,
    buffers,
    bufferViews,
    accessors: accessors.map((a) => {
      const o: Record<string, unknown> = {
        bufferView: a.bufferViewIndex,
        componentType: a.componentType,
        count: a.count,
        type: a.type,
      };
      if (a.min !== undefined) o.min = [...a.min];
      if (a.max !== undefined) o.max = [...a.max];
      return o;
    }),
  };

  // 编码 GLB 或 canonical JSON。
  const canonicalJson = canonicalJsonStringify(doc);
  let glb: Uint8Array | undefined;
  let digestBytes: Uint8Array | string;
  if (format === "glb") {
    glb = encodeGlb(canonicalJson, binaryBuffer);
    digestBytes = glb;
  } else {
    digestBytes = canonicalJson;
  }
  const digest = sha256Digest(digestBytes);

  const mapping: GltfMappingTable = {
    worldId: presentation.worldId,
    revisionId: presentation.revisionId,
    digest: presentation.digest,
    projectionMode: presentation.projectionMode,
    nodes: mappingEntries,
    unresolvedRepresentations: unresolved,
  };

  const parsedJson: GltfDocument = JSON.parse(canonicalJson) as GltfDocument;
  const artifact: GltfArtifact = {
    format,
    json: parsedJson,
    ...(glb !== undefined ? { glb } : {}),
    mapping,
    digest,
  };
  return artifact;
}

/** 从 GltfArtifact 反向提取映射表（round-trip 校验用）。 */
export function extractMapping(artifact: GltfArtifact): GltfMappingTable | null {
  return extractMappingFromDocument(artifact.json);
}
