/**
 * epoch-renderer-babylon 场景构建：WorldPresentation → Babylon 场景图。
 *
 * 映射法（ARCHITECTURE-LOCK #11「Selection is semantic」）：
 * - 每个表现节点建立一个 Babylon TransformNode，每个表现引用建立一个 mesh；
 * - presentationId/entityId 存放在 metadata（node 与 mesh 双侧），
 *   拾取解析链 pointer → scene.pick → mesh.metadata → presentationId →
 *   entityId，绝不从 mesh 名推断身份；
 * - mesh 名是刻意非语义的（"p:{i}" / "m:{i}"），任何以名字为身份的
 *   实现都不可能通过本适配器的测试。
 *
 * 渲染器状态全为临时（ephemeral）：本模块只读表现源，不回写任何字段。
 */
import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import type { LinesMesh } from "@babylonjs/core";
import type { WorldPresentation, WorldPresentationNode } from "@zcode/epoch-world-presentation";
import { resolveRepresentation } from "./representation-fabric.ts";

/** 节点映射记录：渲染器内部的（临时）映射视图。 */
export interface PresentationNodeRecord {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly layerIds: readonly string[];
  readonly selectable: boolean;
  readonly focusable: boolean;
  readonly baseVisible: boolean;
  readonly meshes: Mesh[];
}

/** 会话映射注册表：presentationId → 记录；以及反查索引。 */
export interface SceneMapping {
  readonly byPresentationId: ReadonlyMap<string, PresentationNodeRecord>;
  readonly presentationIdsByEntityId: ReadonlyMap<string, readonly string[]>;
  readonly presentationIdsByLayerId: ReadonlyMap<string, readonly string[]>;
  readonly unresolvedRepresentationFormats: readonly string[];
}

const KIND_BASE_COLORS: Record<string, string> = {
  solid: "#9aa0a8",
  mesh: "#b0b6bf",
  "point-cloud": "#6ec6b8",
  linework: "#3a3f47",
  "annotation-anchor": "#e0b13a",
  "plan-symbol": "#4fb3a9",
  "section-cut": "#d97c2b",
  "generated-proxy": "#8f7fd4",
};

/** 聚焦高亮色（展示层临时状态，非语义）。 */
export const HIGHLIGHT_COLOR = "#ff9f2e";

function standardMaterialFromHex(hex: string, scene: Scene): StandardMaterial {
  const material = new StandardMaterial("mat", scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = new Color3(0.08, 0.08, 0.08);
  return material;
}

function applyNodeTransform(node: WorldPresentationNode, host: TransformNode): void {
  const { translation, rotation, scale } = node.transform;
  host.position.set(translation.x, translation.y, translation.z);
  host.rotationQuaternion = rotation
    ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
    : Quaternion.Identity();
  if (scale) host.scaling.set(scale.x, scale.y, scale.z);
}

function computeFaceNormals(positions: readonly number[]): number[] {
  // 非索引三角形汤的逐面法线（渲染用；拾取不依赖法线）。
  const normals: number[] = [];
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i + 3]! - positions[i]!;
    const ay = positions[i + 4]! - positions[i + 1]!;
    const az = positions[i + 5]! - positions[i + 2]!;
    const bx = positions[i + 6]! - positions[i]!;
    const by = positions[i + 7]! - positions[i + 1]!;
    const bz = positions[i + 8]! - positions[i + 2]!;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (let v = 0; v < 3; v += 1) {
      normals.push(nx, ny, nz);
    }
  }
  return normals;
}

function buildMeshesForNode(
  node: WorldPresentationNode,
  host: TransformNode,
  scene: Scene,
  meshIndex: { value: number },
  unresolvedFormats: Map<string, number>,
): Mesh[] {
  const meshes: Mesh[] = [];
  for (const representation of node.representations) {
    const resolved = resolveRepresentation(representation);
    let mesh: Mesh | null = null;
    if (resolved.kind === "box") {
      mesh = MeshBuilder.CreateBox(
        `m:${meshIndex.value}`,
        { width: resolved.sizeX, height: resolved.sizeY, depth: resolved.sizeZ },
        scene,
      );
    } else if (resolved.kind === "triangles") {
      const candidate = new Mesh(`m:${meshIndex.value}`, scene);
      const vertexData = new VertexData();
      vertexData.positions = [...resolved.positions];
      if (resolved.indices) {
        vertexData.indices = [...resolved.indices];
        const normals: number[] = [];
        VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
        vertexData.normals = normals;
      } else {
        // 非索引三角形汤：合成顺序索引。Babylon 对空索引的 mesh 不会建立
        // 覆盖全部顶点的 SubMesh（indexCount=0，拾取零三角形），顺序索引
        // 把汤转为等价的索引几何。
        const indices: number[] = [];
        for (let i = 0; i < resolved.positions.length; i += 1) indices.push(i);
        vertexData.indices = indices;
        vertexData.normals = computeFaceNormals(resolved.positions);
      }
      vertexData.applyToMesh(candidate);
      mesh = candidate;
    } else if (resolved.kind === "linework") {
      const points: Vector3[] = [];
      for (let i = 0; i + 2 < resolved.points.length; i += 3) {
        points.push(
          new Vector3(resolved.points[i]!, resolved.points[i + 1]!, resolved.points[i + 2]!),
        );
      }
      mesh = MeshBuilder.CreateLines(`m:${meshIndex.value}`, { points }, scene);
    } else {
      unresolvedFormats.set(resolved.format, (unresolvedFormats.get(resolved.format) ?? 0) + 1);
    }
    if (mesh) {
      meshIndex.value += 1;
      mesh.parent = host;
      mesh.metadata = { presentationId: node.presentationId, entityId: node.entityId };
      mesh.isPickable = node.interaction.selectable;
      const lines = mesh as LinesMesh;
      if (typeof lines.color === "undefined") {
        mesh.material = standardMaterialFromHex(
          KIND_BASE_COLORS[representation.kind] ?? "#9aa0a8",
          scene,
        );
      }
      meshes.push(mesh);
    }
  }
  return meshes;
}

/**
 * 构建场景图与映射注册表。构建顺序：先全部 TransformNode（命名非语义），
 * 再链接父子，最后生成几何（顺序无关，表现源只读）。
 */
export function buildSceneGraph(presentation: WorldPresentation, scene: Scene): SceneMapping {
  const byPresentationId = new Map<string, PresentationNodeRecord>();
  const transformNodes = new Map<string, TransformNode>();
  const unresolvedFormats = new Map<string, number>();
  const meshIndex = { value: 0 };

  presentation.nodes.forEach((node, index) => {
    const host = new TransformNode(`p:${index}`, scene);
    applyNodeTransform(node, host);
    host.metadata = { presentationId: node.presentationId, entityId: node.entityId };
    transformNodes.set(node.presentationId, host);
  });

  for (const node of presentation.nodes) {
    const host = transformNodes.get(node.presentationId);
    if (!host) continue;
    const parent = node.parentPresentationId ? transformNodes.get(node.parentPresentationId) : null;
    if (parent) host.parent = parent;
  }

  for (const node of presentation.nodes) {
    const host = transformNodes.get(node.presentationId);
    if (!host) continue;
    byPresentationId.set(node.presentationId, {
      presentationId: node.presentationId,
      entityId: node.entityId,
      layerIds: node.interaction.layerIds,
      selectable: node.interaction.selectable,
      focusable: node.interaction.focusable,
      baseVisible: node.visibility === "visible",
      meshes: buildMeshesForNode(node, host, scene, meshIndex, unresolvedFormats),
    });
  }

  const presentationIdsByEntityId = new Map<string, string[]>();
  const presentationIdsByLayerId = new Map<string, string[]>();
  for (const record of byPresentationId.values()) {
    if (record.entityId) {
      const list = presentationIdsByEntityId.get(record.entityId) ?? [];
      list.push(record.presentationId);
      presentationIdsByEntityId.set(record.entityId, list);
    }
    for (const layerId of record.layerIds) {
      const list = presentationIdsByLayerId.get(layerId) ?? [];
      list.push(record.presentationId);
      presentationIdsByLayerId.set(layerId, list);
    }
  }

  return {
    byPresentationId,
    presentationIdsByEntityId,
    presentationIdsByLayerId,
    unresolvedRepresentationFormats: [...unresolvedFormats.keys()].sort(),
  };
}
