/**
 * @zcode/epoch-gltf 包内测试共享 fixture：确定性 WorldPresentation。
 *
 * 测试表现为 test-local（不依赖 epoch-construction-fixture——另一 worker 并发拥有的面）。
 * 全部几何用内建自描述格式 epoch.box@1 / epoch.triangles@1 / epoch.linework@1 / 未知格式（验证 unresolved 路径）。
 * digest 由 sha256(nodes) 派生——确定性。
 */
import { createHash } from "node:crypto";

export function boxRef(sizeX: number, sizeY: number, sizeZ: number): string {
  return JSON.stringify({ sizeX, sizeY, sizeZ });
}

export function trianglesRef(
  positions: readonly (readonly [number, number, number])[],
  indices?: readonly number[],
): string {
  return JSON.stringify({ positions, indices });
}

export function lineworkRef(
  segments: readonly (readonly [number, number, number, number, number, number])[],
): string {
  return JSON.stringify({ segments });
}

export interface SampleSpec {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly translation: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
  readonly scale?: { readonly x: number; readonly y: number; readonly z: number };
  readonly box?: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
  readonly triangles?: {
    readonly positions: readonly (readonly [number, number, number])[];
    readonly indices?: readonly number[];
  };
  readonly linework?: {
    readonly segments: readonly (readonly [number, number, number, number, number, number])[];
  };
  readonly unknown?: { readonly format: string; readonly ref: string; readonly kind: string };
  readonly layerIds: readonly string[];
  readonly selectable?: boolean;
  readonly focusable?: boolean;
  readonly visibility?: "visible" | "hidden";
}

export function buildSamplePresentation(): Record<string, unknown> {
  const specs: readonly SampleSpec[] = [
    {
      presentationId: "node-root",
      entityId: "entity-wall-001",
      translation: { x: 0, y: 0, z: 0 },
      box: { sizeX: 2, sizeY: 0.2, sizeZ: 2 },
      layerIds: ["layer-structure"],
      selectable: true,
      focusable: true,
    },
    {
      presentationId: "node-child-a",
      entityId: "entity-window-001",
      parentPresentationId: "node-root",
      translation: { x: 0.5, y: 0.3, z: 0 },
      triangles: {
        positions: [
          [0, 0, 0],
          [1, 0, 0],
          [0.5, 1, 0],
        ],
        indices: [0, 1, 2],
      },
      layerIds: ["layer-structure", "layer-opening"],
      selectable: true,
      focusable: false,
    },
    {
      presentationId: "node-child-b",
      parentPresentationId: "node-root",
      translation: { x: -0.5, y: 0.3, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      linework: {
        segments: [
          [0, 0, 0, 0.5, 0.5, 0],
          [0.5, 0.5, 0, 1, 0, 0],
        ],
      },
      layerIds: ["layer-annotation"],
      visibility: "hidden",
    },
    {
      presentationId: "node-leaf-unsupported",
      entityId: "entity-future-001",
      translation: { x: 10, y: 10, z: 10 },
      unknown: { format: "epoch.future-ifc@999", ref: "opaque-blob-ref", kind: "generated-proxy" },
      layerIds: [],
      selectable: false,
      focusable: false,
    },
  ];
  const nodes = specs.map((spec) => {
    const representations: {
      representationId: string;
      kind: string;
      format: string;
      ref: string;
    }[] = [];
    if (spec.box) {
      representations.push({
        representationId: `${spec.presentationId}-rep-box`,
        kind: "solid",
        format: "epoch.box@1",
        ref: boxRef(spec.box.sizeX, spec.box.sizeY, spec.box.sizeZ),
      });
    }
    if (spec.triangles) {
      representations.push({
        representationId: `${spec.presentationId}-rep-tri`,
        kind: "mesh",
        format: "epoch.triangles@1",
        ref: trianglesRef(spec.triangles.positions, spec.triangles.indices),
      });
    }
    if (spec.linework) {
      representations.push({
        representationId: `${spec.presentationId}-rep-line`,
        kind: "linework",
        format: "epoch.linework@1",
        ref: lineworkRef(spec.linework.segments),
      });
    }
    if (spec.unknown) {
      representations.push({
        representationId: `${spec.presentationId}-rep-unknown`,
        kind: spec.unknown.kind,
        format: spec.unknown.format,
        ref: spec.unknown.ref,
      });
    }
    return {
      presentationId: spec.presentationId,
      ...(spec.entityId !== undefined ? { entityId: spec.entityId } : {}),
      ...(spec.parentPresentationId !== undefined
        ? { parentPresentationId: spec.parentPresentationId }
        : {}),
      transform: {
        translation: spec.translation,
        ...(spec.rotation !== undefined ? { rotation: spec.rotation } : {}),
        ...(spec.scale !== undefined ? { scale: spec.scale } : {}),
      },
      representations,
      visibility: spec.visibility ?? "visible",
      interaction: {
        selectable: spec.selectable ?? true,
        focusable: spec.focusable ?? true,
        layerIds: spec.layerIds,
      },
    };
  });
  return {
    worldId: "world-test-010",
    revisionId: "rev-001",
    digest: createHash("sha256").update(JSON.stringify(nodes)).digest("hex"),
    projectionMode: "3d",
    nodes,
  };
}

/** 提取 fixture 期望的 presentationId 集合（断言无丢弃用）。 */
export function expectedPresentationIds(): readonly string[] {
  return ["node-root", "node-child-a", "node-child-b", "node-leaf-unsupported"];
}

/** 提取 fixture 期望的（presentationId, entityId?）映射。 */
export function expectedEntityIds(): readonly { presentationId: string; entityId?: string }[] {
  return [
    { presentationId: "node-root", entityId: "entity-wall-001" },
    { presentationId: "node-child-a", entityId: "entity-window-001" },
    { presentationId: "node-child-b" },
    { presentationId: "node-leaf-unsupported", entityId: "entity-future-001" },
  ];
}

/** fixture 期望的未解析表现引用（node-leaf-unsupported 的 epoch.future-ifc@999）。 */
export function expectedUnresolved(): readonly {
  presentationId: string;
  representationId: string;
  kind: string;
  format: string;
}[] {
  return [
    {
      presentationId: "node-leaf-unsupported",
      representationId: "node-leaf-unsupported-rep-unknown",
      kind: "generated-proxy",
      format: "epoch.future-ifc@999",
    },
  ];
}
