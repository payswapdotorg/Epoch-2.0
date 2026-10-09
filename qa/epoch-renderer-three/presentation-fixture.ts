/**
 * W008 qa 一致性夹具：确定性 test-local 微型施工表现（site + 结构 + 围护 +
 * MEP + 注记锚点 + 隐藏节点 + 父子装配）。不依赖 epoch-construction-fixture
 * （另一 worker 拥有的面）；几何全部用适配器内建自描述格式。
 *
 * 与 W004 qa 夹具同布局（相同节点、相同世界 AABB、相同期望可点击实体），
 * 使同一表现可被两个渲染器无差别挂载——可移植状态等价性证明的基础。
 *
 * 布局为开敞式构造（无屋面板遮挡）：相机 home 视角为自南侧（-z）仰 30°
 * 俯瞰——所有 EXPECTED_CLICKABLE 实体在该视角下均无遮挡；每个实体的世界
 * AABB 显式声明，点击解析必须落在对应 AABB 内（点击↔实体绑定的几何证明，
 * 非循环验证）。
 */
import { createHash } from "node:crypto";

export interface FixtureNodeInput {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly translation: { readonly x: number; readonly y: number; readonly z: number };
  readonly box?: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
  readonly layerIds: readonly string[];
  readonly selectable?: boolean;
  readonly focusable?: boolean;
  readonly visibility?: "visible" | "hidden";
}

function boxRepresentation(presentationId: string, size: { x: number; y: number; z: number }) {
  return {
    representationId: `${presentationId}-rep-0`,
    kind: "mesh" as const,
    format: "epoch.box@1",
    ref: JSON.stringify({ sizeX: size.x, sizeY: size.y, sizeZ: size.z }),
  };
}

export const FIXTURE_NODES: readonly FixtureNodeInput[] = [
  {
    presentationId: "presentation-site-slab",
    entityId: "site-slab-001",
    translation: { x: 0, y: -0.15, z: 0 },
    box: { x: 12, y: 0.3, z: 10 },
    layerIds: ["site"],
    selectable: false,
    focusable: false,
  },
  {
    presentationId: "presentation-column-1",
    entityId: "column-001",
    translation: { x: 3, y: 1.5, z: 2 },
    box: { x: 0.4, y: 3, z: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-column-2",
    entityId: "column-002",
    translation: { x: -3, y: 1.5, z: 2 },
    box: { x: 0.4, y: 3, z: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-canopy-frame",
    entityId: "canopy-frame-001",
    translation: { x: -3, y: 0, z: -2 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-canopy-post",
    entityId: "canopy-post-001",
    parentPresentationId: "presentation-canopy-frame",
    translation: { x: 0, y: 1.5, z: 0 },
    box: { x: 0.35, y: 3, z: 0.35 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-beam-south",
    entityId: "beam-001",
    translation: { x: 0, y: 3.1, z: 2.6 },
    box: { x: 7, y: 0.3, z: 0.3 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-wall-north",
    entityId: "wall-001",
    translation: { x: 0, y: 1.5, z: -3 },
    box: { x: 8, y: 3, z: 0.2 },
    layerIds: ["envelope"],
  },
  {
    presentationId: "presentation-conduit-mep",
    entityId: "conduit-001",
    translation: { x: 4.2, y: 2, z: -2.9 },
    box: { x: 0.15, y: 0.15, z: 2 },
    layerIds: ["mep"],
  },
  {
    presentationId: "presentation-survey-anchor",
    translation: { x: -5.5, y: 0.1, z: 4.5 },
    box: { x: 0.2, y: 0.2, z: 0.2 },
    layerIds: ["annotations"],
  },
  {
    presentationId: "presentation-future-extension",
    entityId: "future-extension-001",
    translation: { x: 0, y: 0.1, z: 5.5 },
    box: { x: 2, y: 0.2, z: 1 },
    layerIds: ["site"],
    visibility: "hidden",
  },
];

/** 期望可点击的实体（entityId → 世界 AABB 与 presentationId）。 */
export const EXPECTED_CLICKABLE: Readonly<
  Record<
    string,
    {
      presentationId: string;
      aabb: { min: [number, number, number]; max: [number, number, number] };
    }
  >
> = {
  "column-001": {
    presentationId: "presentation-column-1",
    aabb: { min: [2.8, 0, 1.8], max: [3.2, 3, 2.2] },
  },
  "column-002": {
    presentationId: "presentation-column-2",
    aabb: { min: [-3.2, 0, 1.8], max: [-2.8, 3, 2.2] },
  },
  "canopy-post-001": {
    presentationId: "presentation-canopy-post",
    aabb: { min: [-3.175, 0, -2.175], max: [-2.825, 3, -1.825] },
  },
  "beam-001": {
    presentationId: "presentation-beam-south",
    aabb: { min: [-3.5, 2.95, 2.45], max: [3.5, 3.25, 2.75] },
  },
  "wall-001": {
    presentationId: "presentation-wall-north",
    aabb: { min: [-4, 0, -3.1], max: [4, 3, -2.9] },
  },
  "conduit-001": {
    presentationId: "presentation-conduit-mep",
    aabb: { min: [4.125, 1.925, -3.9], max: [4.275, 2.075, -1.9] },
  },
};

/** 不应被拾取的身份（不可选/隐藏）。 */
export const EXPECTED_UNCLICKABLE: readonly string[] = [
  "site-slab-001",
  "future-extension-001",
  "canopy-frame-001",
];

export const HEADLESS_VIEWPORT = { width: 800, height: 600 } as const;

/**
 * 构建确定性表现（每次调用同一 JSON 结构，digest 稳定）。
 * worldId 使用 w008- 前缀以区分 W004 夹具（但 digest 与节点结构一致，
 * 使跨渲染器等价性证明可对照）。
 */
export function buildFixturePresentation(): Record<string, unknown> {
  const nodes = FIXTURE_NODES.map((input) => ({
    presentationId: input.presentationId,
    ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
    ...(input.parentPresentationId !== undefined
      ? { parentPresentationId: input.parentPresentationId }
      : {}),
    transform: { translation: input.translation },
    representations: input.box ? [boxRepresentation(input.presentationId, input.box)] : [],
    visibility: input.visibility ?? "visible",
    interaction: {
      selectable: input.selectable ?? true,
      focusable: input.focusable ?? true,
      layerIds: input.layerIds,
    },
  }));
  return {
    worldId: "w008-conformance-fixture",
    revisionId: "rev-001",
    digest: createHash("sha256").update(JSON.stringify(nodes)).digest("hex"),
    projectionMode: "3d",
    nodes,
  };
}

/** AABB 包含判定（带浮点容差——射线求交的命中点可能带 ~1e-15 误差）。 */
export function pointInsideAabb(
  point: { x: number; y: number; z: number },
  aabb: { min: readonly [number, number, number]; max: readonly [number, number, number] },
): boolean {
  const epsilon = 1e-6;
  return (
    point.x >= aabb.min[0] - epsilon &&
    point.x <= aabb.max[0] + epsilon &&
    point.y >= aabb.min[1] - epsilon &&
    point.y <= aabb.max[1] + epsilon &&
    point.z >= aabb.min[2] - epsilon &&
    point.z <= aabb.max[2] + epsilon
  );
}
