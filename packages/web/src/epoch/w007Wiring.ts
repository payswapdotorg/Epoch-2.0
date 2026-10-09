/**
 * W007 — Web 端 Solution 运行时 + 交互层装配（additive，最小改动）。
 *
 * 在 W005 已有的组合根（compositionRoot.ts）之上，叠加：
 * - epoch-solution-runtime：宿主无关运行时（持有 portable view state + dispatch）。
 * - epoch-world-interaction：测量/标注注册表 + plan/section path 计算。
 *
 * 边界法（W007 ownership）：本文件是新增文件（不修改 compositionRoot.ts 的
 * 既有逻辑），只暴露一个工厂让宿主 UI hook 在拿到 SolutionHostOpenResult 后
 * 把 handle 注入 runtime。Composition/registration only — 不引入引擎特定
 * surface 类型（invariant #6），不按 engineId 分支（invariant #8）。
 */
import type { WorldPresentation } from "@zcode/epoch-world-presentation";
import type { Vec3 } from "@zcode/epoch-world-presentation";
import { createWorldInteraction } from "@zcode/epoch-world-interaction";
import type { WorldInteractionLayer } from "@zcode/epoch-world-interaction";
import {
  createSolutionRuntime,
  type SolutionRuntime,
  type SolutionRuntimeHandle,
} from "@zcode/epoch-solution-runtime";
import type { SolutionHostOpenResult } from "./contract.js";

/**
 * Web 端 fixture 实体的最小形状（W007 runtime 只读 entityId + geometry.position）。
 * W005 的 fixture 实体携带更多字段，但 runtime 只用这两个；故接受最小形状以解耦。
 */
export interface FixtureEntityLike {
  readonly entityId: string;
  readonly geometry?: { readonly position: readonly [number, number, number] };
}

/**
 * W007 装配：runtime + interaction layer + entityPoints 映射（来自 fixture）。
 * 宿主在 openReferenceSolution 完成后调用 wireSolutionRuntime(result) 注入 handle。
 */
export interface WebSolutionRuntimeWiring {
  readonly runtime: SolutionRuntime;
  readonly interaction: WorldInteractionLayer;
  /** fixture 六层 id（图层 isolate 用）。 */
  readonly layerIds: readonly string[];
}

/**
 * 把 W005 的 openResult 折算为 runtime handle（W007 边界法：只装配，不重写 open 流程）。
 */
export function adaptOpenResultToHandle(
  result: SolutionHostOpenResult,
  engineName: string,
): SolutionRuntimeHandle {
  return {
    tab: result.tab,
    revision: result.revision,
    presentation: result.presentation,
    renderer: {
      descriptor: () => ({
        id: "epoch-renderer-babylon",
        name: "Babylon.js Interactive Renderer",
        version: "0.1.0",
        capabilities: {
          web: true,
          desktop: true,
          webgl: true,
          hitTesting: true,
          plan: true,
          section: false,
          walk: false,
        },
      }),
      mount: async () => result.rendererSession,
    },
    rendererSession: result.rendererSession,
    engineName,
  };
}

/**
 * 从 fixture 实体集合构造 entityId -> 世界坐标映射（用于解析只锚定 entityId 的测量点）。
 * fixture 实体携带 geometry.position（[x,y,z] 米）。
 */
export function buildEntityPointsFromFixture(
  entities: ReadonlyArray<{
    entityId: string;
    geometry?: { position: readonly [number, number, number] };
  }>,
): ReadonlyMap<string, Vec3> {
  const map = new Map<string, Vec3>();
  for (const entity of entities) {
    if (!entity.geometry?.position) continue;
    const [x, y, z] = entity.geometry.position;
    map.set(entity.entityId, { x: x ?? 0, y: y ?? 0, z: z ?? 0 });
  }
  return map;
}

/**
 * 从 fixture 实体集合构造六层 id（用于 isolate）。
 */
export function buildLayerIdsFromFixture(
  entities: ReadonlyArray<{ layer?: string }>,
): readonly string[] {
  const ids = new Set<string>();
  for (const entity of entities) {
    if (entity.layer && typeof entity.layer === "string") ids.add(entity.layer);
  }
  return [...ids];
}

/**
 * 创建一个 W007 装配：runtime + interaction layer。宿主在拿到 openResult 后
 * 调用 wireSolutionRuntime(result) 把 handle 注入 runtime。
 */
export function createWebSolutionRuntimeWiring(): WebSolutionRuntimeWiring {
  const runtime = createSolutionRuntime();
  const interaction = createWorldInteraction({ entityPoints: new Map() });
  return { runtime, interaction, layerIds: [] };
}

/**
 * 把 W005 的 openResult 注入 runtime + interaction（更新 entityPoints 映射）。
 * 返回一个新的 wiring（runtime/interaction 是同一个对象，引用更新 entityPoints）。
 */
export function wireSolutionRuntime(
  wiring: WebSolutionRuntimeWiring,
  result: SolutionHostOpenResult,
  fixtureEntities: ReadonlyArray<FixtureEntityLike>,
  engineName: string,
  layerIds: readonly string[],
): WebSolutionRuntimeWiring {
  // 用 fixture entity points 重建 interaction layer（让测量能解析 entityId 锚点）。
  const entityPoints = buildEntityPointsFromFixture(fixtureEntities);
  const interaction = createWorldInteraction({ entityPoints });
  const handle = adaptOpenResultToHandle(result, engineName);
  wiring.runtime.attachHandle(handle);
  return { runtime: wiring.runtime, interaction, layerIds };
}

/**
 * 从 fixture 实体的 geometry.position 推算世界包围中心 + 半径（plan/section path 用）。
 */
export function computeFixtureWorldBounds(presentation: WorldPresentation): {
  center: Vec3;
  radius: number;
} {
  if (presentation.nodes.length === 0) {
    return { center: { x: 0, y: 0, z: 0 }, radius: 10 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const node of presentation.nodes) {
    const t = node.transform.translation;
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    minZ = Math.min(minZ, t.z);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
    maxZ = Math.max(maxZ, t.z);
  }
  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  const radius = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2, 1);
  return { center, radius };
}
