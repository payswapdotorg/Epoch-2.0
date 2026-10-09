/**
 * Desktop Solution Host — presentation compiler shim.
 *
 * W006 边界法：把 construction-fixture 引擎产出的 WorldRevision 投影为渲染器中立的
 * WorldPresentation，供 Babylon 适配器挂载。冻结的 epoch-world-presentation 契约定义了
 * PresentationCompiler 接口，但 W001–W004 未交付编译器实现（属 W002/W007 范畴）。
 * 这里是宿主侧最小确定性编译器：仅消费冻结契约公开导出（ConstructionFixtureEntity /
 * GeometrySeed / CONSTRUCTION_LAYERS），不深引用引擎内部文件，不引入任何渲染器实现类型。
 *
 * 几何映射（renderer-neutral 数据，由 babylon fabric 解析）：
 * - box       -> epoch.box@1       { sizeX, sizeY, sizeZ }
 * - cylinder  -> epoch.triangles@1 { positions, indices }（参数化 16 段圆柱）
 * - plane     -> epoch.box@1       { sizeX, sizeY:0.02, sizeZ }（薄板近似）
 * - line      -> epoch.box@1       { sizeX:length, sizeY/Z:diameter }（细长盒近似，与 fixture 语义一致）
 * - point     -> epoch.box@1       { 0.1 立方体 }
 *
 * 选择语义（invariant 11）：每个节点携带 entityId + interaction.selectable/layerIds，
 * 命中解析沿 presentationId -> node -> entityId 链路，UI 不从 mesh 名推断工程身份。
 */
import type { WorldRevision } from "@zcode/epoch-world-model";
import type {
  Quaternion,
  RepresentationRef,
  Transform,
  WorldPresentation,
  WorldPresentationNode,
} from "@zcode/epoch-world-presentation";
import type { ConstructionFixtureEntity, GeometrySeed } from "@zcode/epoch-construction-fixture";
import { isGeometrySeed } from "@zcode/epoch-construction-fixture";

const BOX_FORMAT = "epoch.box@1";
const TRIANGLES_FORMAT = "epoch.triangles@1";
const CYLINDER_SEGMENTS = 16;

/** Euler 角（度，XYZ 内禀）转四元数。rotation 缺省时不生成。 */
function eulerDegToQuaternion(rxDeg: number, ryDeg: number, rzDeg: number): Quaternion {
  const rx = (rxDeg * Math.PI) / 180 / 2;
  const ry = (ryDeg * Math.PI) / 180 / 2;
  const rz = (rzDeg * Math.PI) / 180 / 2;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // XYZ 内禀：q = qx * qy * qz
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

/** 确定性字符串散列（浏览器侧无需 node:crypto；只用于 presentation.digest 非空稳定串）。 */
function djb2(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/** 生成圆柱三角网格（半径 r、高 h，沿 Y 轴，底面在 -h/2、顶面在 +h/2）。 */
function cylinderMesh(
  radius: number,
  height: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 0.001;
  const h = Number.isFinite(height) && height > 0 ? height : 0.001;
  const half = h / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * r, -half, Math.sin(angle) * r);
  }
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * r, half, Math.sin(angle) * r);
  }
  for (let index = 0; index < segments; index += 1) {
    const b0 = index;
    const b1 = (index + 1) % segments;
    const t0 = segments + index;
    const t1 = segments + ((index + 1) % segments);
    indices.push(b0, b1, t0, b1, t1, t0);
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, -half, 0);
  for (let index = 0; index < segments; index += 1) {
    const b0 = index;
    const b1 = (index + 1) % segments;
    indices.push(bottomCenter, b1, b0);
  }
  const topCenter = positions.length / 3;
  positions.push(0, half, 0);
  for (let index = 0; index < segments; index += 1) {
    const t0 = segments + index;
    const t1 = segments + ((index + 1) % segments);
    indices.push(topCenter, t0, t1);
  }
  return { positions, indices };
}

/** 按 GeometryKind 构造渲染器中立的 RepresentationRef（ref 为 babylon fabric 可解析的内联 JSON）。 */
function representationsForGeometry(
  geometry: GeometrySeed,
  presentationId: string,
): RepresentationRef[] {
  const size = geometry.size;
  switch (geometry.kind) {
    case "box": {
      const w = size[0] ?? 0;
      const h = size[1] ?? 0;
      const d = size[2] ?? 0;
      return [
        {
          representationId: `${presentationId}-box`,
          kind: "mesh",
          format: BOX_FORMAT,
          ref: JSON.stringify({ sizeX: w, sizeY: h, sizeZ: d }),
        },
      ];
    }
    case "cylinder": {
      const r = size[0] ?? 0;
      const h = size[1] ?? 0;
      const mesh = cylinderMesh(r, h, CYLINDER_SEGMENTS);
      return [
        {
          representationId: `${presentationId}-cylinder`,
          kind: "mesh",
          format: TRIANGLES_FORMAT,
          ref: JSON.stringify({ positions: mesh.positions, indices: mesh.indices }),
        },
      ];
    }
    case "plane": {
      const w = size[0] ?? 0;
      const len = size[1] ?? 0;
      return [
        {
          representationId: `${presentationId}-plane`,
          kind: "mesh",
          format: BOX_FORMAT,
          ref: JSON.stringify({ sizeX: w, sizeY: 0.02, sizeZ: len }),
        },
      ];
    }
    case "line": {
      const length = size[0] ?? 0;
      const diameter = size[1] ?? 0.02;
      const thickness = Number.isFinite(diameter) && diameter > 0 ? diameter : 0.02;
      return [
        {
          representationId: `${presentationId}-line`,
          kind: "mesh",
          format: BOX_FORMAT,
          ref: JSON.stringify({ sizeX: length, sizeY: thickness, sizeZ: thickness }),
        },
      ];
    }
    case "point":
    default: {
      return [
        {
          representationId: `${presentationId}-point`,
          kind: "mesh",
          format: BOX_FORMAT,
          ref: JSON.stringify({ sizeX: 0.1, sizeY: 0.1, sizeZ: 0.1 }),
        },
      ];
    }
  }
}

function transformForGeometry(geometry: GeometrySeed): Transform {
  const position = geometry.position;
  const translation = {
    x: position[0] ?? 0,
    y: position[1] ?? 0,
    z: position[2] ?? 0,
  };
  const rotation = geometry.rotation;
  if (rotation && rotation.length === 3) {
    return {
      translation,
      rotation: eulerDegToQuaternion(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0),
    };
  }
  return { translation };
}

/**
 * 编译确定性 WorldPresentation：每个 fixture 实体投影为一个可选中、可聚焦、归属其语义图层的节点。
 * 节点选择语义绑回 entityId（invariant 11），图层可见性绑回 layerIds（invariant 3 / interaction contract）。
 */
export function compileFixturePresentation(revision: WorldRevision): WorldPresentation {
  const nodes: WorldPresentationNode[] = [];
  for (const entity of revision.entities) {
    const fixtureEntity = entity as ConstructionFixtureEntity;
    const geometry = fixtureEntity.geometry;
    if (!isGeometrySeed(geometry)) {
      // 非几何实体（纯语义）不进入世界表现；选择/图层仍由语义层处理。
      continue;
    }
    const presentationId = `presentation:${entity.entityId}`;
    const layer =
      typeof fixtureEntity.layer === "string" && fixtureEntity.layer.length > 0
        ? fixtureEntity.layer
        : "STRUCTURE";
    nodes.push({
      presentationId,
      entityId: entity.entityId,
      transform: transformForGeometry(geometry),
      representations: representationsForGeometry(geometry, presentationId),
      visibility: "visible",
      interaction: {
        selectable: true,
        focusable: true,
        layerIds: [layer],
      },
    });
  }
  const digest = djb2(nodes.map((node) => node.presentationId).join("|"));
  return {
    worldId: revision.worldId,
    revisionId: revision.revisionId,
    digest: `${revision.digest.slice(0, 8)}:${digest}`,
    projectionMode: "3d",
    nodes,
  };
}
