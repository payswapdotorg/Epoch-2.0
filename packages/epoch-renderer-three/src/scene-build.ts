/**
 * epoch-renderer-three 场景构建：WorldPresentation → Three.js 场景图。
 *
 * 映射法（ARCHITECTURE-LOCK #11「Selection is semantic」）：
 * - 每个表现节点建立一个 THREE.Object3D（Group），每个表现引用建立一个
 *   Mesh / LineSegments2D；
 * - presentationId/entityId 存放在 userData（node 与 mesh 双侧），
 *   拾取解析链 pointer → Raycaster → intersect.object → userData →
 *   presentationId → entityId，绝不从 mesh 名推断身份；
 * - mesh 名是刻意非语义的（"p:{i}" / "m:{i}"），任何以名字为身份的
 *   实现都不可能通过本适配器的测试；
 * - 不可选节点的几何被 raycaster 通过 layers 屏蔽（mask 排除层 0），
 *   与 Babylon mesh.isPickable=false 同语义。
 *
 * 渲染器状态全为临时（ephemeral）：本模块只读表现源，不回写任何字段。
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
// MeshStandardMaterial 是 Three 的 PBR 材质；specular 字段属于旧式 MeshPhongMaterial，
// 这里不使用。
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
  readonly meshes: Object3D[];
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

const PICK_LAYER = 0;
const NO_PICK_LAYER = 1;

function standardMaterialFromHex(hex: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: new Color(hex) });
  material.metalness = 0;
  material.roughness = 0.85;
  return material;
}

function applyNodeTransform(node: WorldPresentationNode, host: Object3D): void {
  const { translation, rotation, scale } = node.transform;
  host.position.set(translation.x, translation.y, translation.z);
  if (rotation) {
    host.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  } else {
    host.quaternion.set(0, 0, 0, 1);
  }
  if (scale) {
    host.scale.set(scale.x, scale.y, scale.z);
  } else {
    host.scale.set(1, 1, 1);
  }
  host.updateMatrixWorld(true);
}

function buildObjectsForNode(
  node: WorldPresentationNode,
  host: Object3D,
  meshIndex: { value: number },
  unresolvedFormats: Map<string, number>,
): Object3D[] {
  const objects: Object3D[] = [];
  for (const representation of node.representations) {
    const resolved = resolveRepresentation(representation);
    let object: Object3D | null = null;
    if (resolved.kind === "box") {
      const geometry = new BoxGeometry(resolved.sizeX, resolved.sizeY, resolved.sizeZ);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(
        geometry,
        standardMaterialFromHex(KIND_BASE_COLORS[representation.kind] ?? "#9aa0a8"),
      );
      mesh.name = `m:${meshIndex.value}`;
      object = mesh;
    } else if (resolved.kind === "triangles") {
      const geometry = new BufferGeometry();
      const positions = Float32Array.from(resolved.positions);
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      if (resolved.indices) {
        const indices =
          resolved.indices.length <= 65535
            ? Uint16Array.from(resolved.indices)
            : Uint32Array.from(resolved.indices);
        geometry.setIndex(new BufferAttribute(indices, 1));
      } else {
        // 非索引三角形汤：合成顺序索引，使每三个顶点形成一个三角形。
        const indices = new Uint32Array(resolved.positions.length / 3);
        for (let i = 0; i < indices.length; i += 1) indices[i] = i;
        geometry.setIndex(new BufferAttribute(indices, 1));
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(
        geometry,
        standardMaterialFromHex(KIND_BASE_COLORS[representation.kind] ?? "#9aa0a8"),
      );
      mesh.name = `m:${meshIndex.value}`;
      object = mesh;
    } else if (resolved.kind === "linework") {
      const points = Float32Array.from(resolved.points);
      // 折线顶点展开为线段端点对（与 Babylon CreateLines 同语义：相邻两点成段）。
      const segmentPositions: number[] = [];
      const vertexCount = points.length / 3;
      for (let i = 0; i + 1 < vertexCount; i += 1) {
        const a = i * 3;
        const b = (i + 1) * 3;
        segmentPositions.push(points[a]!, points[a + 1]!, points[a + 2]!);
        segmentPositions.push(points[b]!, points[b + 1]!, points[b + 2]!);
      }
      const lineGeometry = new BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(segmentPositions), 3),
      );
      lineGeometry.computeBoundingBox();
      lineGeometry.computeBoundingSphere();
      const material = new LineBasicMaterial({
        color: new Color(KIND_BASE_COLORS[representation.kind] ?? "#3a3f47"),
      });
      const lines = new LineSegments(lineGeometry, material);
      lines.name = `m:${meshIndex.value}`;
      object = lines;
    } else {
      unresolvedFormats.set(resolved.format, (unresolvedFormats.get(resolved.format) ?? 0) + 1);
    }
    if (object) {
      meshIndex.value += 1;
      host.add(object);
      object.userData = { presentationId: node.presentationId, entityId: node.entityId };
      // 不可选节点：把几何放入非拾取层，使 raycaster（layers mask = 层 0）跳过。
      if (node.interaction.selectable) {
        object.layers.set(PICK_LAYER);
      } else {
        object.layers.set(NO_PICK_LAYER);
      }
      objects.push(object);
    }
  }
  return objects;
}

/**
 * 构建场景图与映射注册表。构建顺序：先全部 Group（命名非语义），
 * 再链接父子，最后生成几何（顺序无关，表现源只读）。
 */
export function buildSceneGraph(presentation: WorldPresentation): {
  readonly root: Group;
  readonly mapping: SceneMapping;
} {
  const root = new Group();
  root.name = "epoch-three-root";
  const byPresentationId = new Map<string, PresentationNodeRecord>();
  const transformNodes = new Map<string, Object3D>();
  const unresolvedFormats = new Map<string, number>();
  const meshIndex = { value: 0 };

  presentation.nodes.forEach((node, index) => {
    const host = new Group();
    host.name = `p:${index}`;
    applyNodeTransform(node, host);
    host.userData = { presentationId: node.presentationId, entityId: node.entityId };
    transformNodes.set(node.presentationId, host);
    root.add(host);
  });

  for (const node of presentation.nodes) {
    const host = transformNodes.get(node.presentationId);
    if (!host) continue;
    const parent = node.parentPresentationId ? transformNodes.get(node.parentPresentationId) : null;
    if (parent) {
      // 重新挂接到正确父节点。
      root.remove(host);
      parent.add(host);
    }
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
      meshes: buildObjectsForNode(node, host, meshIndex, unresolvedFormats),
    });
  }

  root.updateMatrixWorld(true);

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
    root,
    mapping: {
      byPresentationId,
      presentationIdsByEntityId,
      presentationIdsByLayerId,
      unresolvedRepresentationFormats: [...unresolvedFormats.keys()].sort(),
    },
  };
}

/** 世界 AABB（世界坐标，供相机框选与点击命中验证）。 */
export interface WorldAabb {
  readonly min: Vector3;
  readonly max: Vector3;
}

/** 计算全部几何的世界 AABB 并集。 */
export function computeWorldBounds(root: Group): WorldAabb {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  root.traverse((object) => {
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
    if (!geometry) return;
    const box = geometry.boundingBox;
    if (!box) return;
    // 几何 AABB 是局部坐标；变换到世界坐标。
    const objectWorld = object.matrixWorld;
    const corners = [
      new Vector3(box.min.x, box.min.y, box.min.z),
      new Vector3(box.max.x, box.min.y, box.min.z),
      new Vector3(box.min.x, box.max.y, box.min.z),
      new Vector3(box.max.x, box.max.y, box.min.z),
      new Vector3(box.min.x, box.min.y, box.max.z),
      new Vector3(box.max.x, box.min.y, box.max.z),
      new Vector3(box.min.x, box.max.y, box.max.z),
      new Vector3(box.max.x, box.max.y, box.max.z),
    ];
    for (const corner of corners) {
      corner.applyMatrix4(objectWorld);
      if (min === null || max === null) {
        min = corner.clone();
        max = corner.clone();
      } else {
        min = min.min(corner);
        max = max.max(corner);
      }
    }
  });
  if (min === null || max === null) {
    return { min: new Vector3(-5, -5, -5), max: new Vector3(5, 5, 5) };
  }
  return { min, max };
}

/** 计算给定 presentationId 集合的世界 AABB 并集。 */
export function computeBoundsForRecords(
  mapping: SceneMapping,
  presentationIds: readonly string[],
): WorldAabb | null {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const presentationId of presentationIds) {
    const record = mapping.byPresentationId.get(presentationId);
    if (!record) continue;
    for (const object of record.meshes) {
      const geometry = (object as Mesh).geometry as BufferGeometry | undefined;
      if (!geometry || !geometry.boundingBox) continue;
      const objectWorld = object.matrixWorld;
      const box = geometry.boundingBox;
      const corners = [
        new Vector3(box.min.x, box.min.y, box.min.z),
        new Vector3(box.max.x, box.min.y, box.min.z),
        new Vector3(box.min.x, box.max.y, box.min.z),
        new Vector3(box.max.x, box.max.y, box.min.z),
        new Vector3(box.min.x, box.min.y, box.max.z),
        new Vector3(box.max.x, box.min.y, box.max.z),
        new Vector3(box.min.x, box.max.y, box.max.z),
        new Vector3(box.max.x, box.max.y, box.max.z),
      ];
      for (const corner of corners) {
        corner.applyMatrix4(objectWorld);
        if (min === null || max === null) {
          min = corner.clone();
          max = corner.clone();
        } else {
          min = min.min(corner);
          max = max.max(corner);
        }
      }
    }
  }
  if (min === null || max === null) return null;
  return { min, max };
}
