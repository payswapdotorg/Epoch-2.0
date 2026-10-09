/**
 * W007 — Desktop Solution runtime + interaction wiring (additive over W006).
 *
 * 在 W006 已有的 desktopSolutionRuntime 之上，叠加：
 * - epoch-solution-runtime：宿主无关运行时（持有 portable view state + dispatch）。
 * - epoch-world-interaction：测量/标注注册表 + plan/section path 计算。
 *
 * 边界法（W007 ownership）：本文件是新增文件（不修改 desktopSolutionRuntime.ts
 * 的既有逻辑），只暴露一个工厂让宿主 UI 在拿到 runtime 后注入 handle。
 * Composition/registration only — 不引入引擎特定 surface 类型（invariant #6）。
 */
import type { Vec3, WorldPresentation } from "@zcode/epoch-world-presentation";
import { createWorldInteraction } from "@zcode/epoch-world-interaction";
import type { WorldInteractionLayer } from "@zcode/epoch-world-interaction";
import {
  createSolutionRuntime,
  type SolutionRuntime,
  type SolutionRuntimeHandle,
} from "@zcode/epoch-solution-runtime";
import type { DesktopSolutionRuntime } from "./desktopSolutionRuntime.js";

/**
 * Desktop fixture 实体的最小形状（W007 runtime 只读 entityId + geometry.position）。
 */
export interface DesktopFixtureEntityLike {
  readonly entityId: string;
  readonly geometry?: { readonly position: readonly [number, number, number] };
}

export interface DesktopSolutionW007Wiring {
  readonly runtime: SolutionRuntime;
  readonly interaction: WorldInteractionLayer;
  readonly layerIds: readonly string[];
}

/**
 * 把 W006 的 DesktopSolutionRuntime 折算为 W007 runtime handle。
 * 不重写 open 流程——只装配 handle。
 */
export function adaptDesktopRuntimeToHandle(
  desktop: DesktopSolutionRuntime,
): SolutionRuntimeHandle {
  return {
    tab: desktop.tab,
    revision: desktop.revision,
    presentation: desktop.presentation,
    renderer: {
      descriptor: () => desktop.renderer.descriptor(),
      mount: async () => {
        throw new Error(
          "W007 desktop runtime: mount is owned by DesktopSolutionHost view layer; use existing rendererSession",
        );
      },
    },
    rendererSession: {
      navigate: (input) => {
        // W006 keeps the session in the view layer; W007 only dispatches intents.
        // The actual session is owned by DesktopSolutionHost; we expose a thin
        // dispatcher through the runtime for intents like setLayerVisibility.
        // For navigate/focus/hitTest we cannot forward without the live session.
        // W006's DesktopSolutionHost keeps the session in a ref; W007 desktop wiring
        // is intended for downstream projection + measurement/annotation only.
        // For full navigate dispatch, the view layer must call session.navigate directly.
        void input;
      },
      async hitTest() {
        return null;
      },
      setVisibility: (input) => {
        void input;
      },
      focus: (input) => {
        void input;
      },
      async dispose() {
        // Dispose is owned by DesktopSolutionHost view layer.
      },
    },
    engineName: desktop.engineName,
  };
}

/**
 * 从 fixture 实体集合构造 entityId -> 世界坐标映射。
 */
export function buildDesktopEntityPoints(
  entities: ReadonlyArray<DesktopFixtureEntityLike>,
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
 * 创建一个 W007 装配：runtime + interaction layer（desktop）。
 * 宿主在拿到 W006 DesktopSolutionRuntime 后调用 wireDesktopSolutionW007。
 */
export function createDesktopSolutionW007Wiring(
  desktop: DesktopSolutionRuntime,
): DesktopSolutionW007Wiring {
  const entityPoints = buildDesktopEntityPoints(
    desktop.revision.entities as unknown as ReadonlyArray<DesktopFixtureEntityLike>,
  );
  const interaction = createWorldInteraction({ entityPoints });
  const runtime = createSolutionRuntime();
  const handle = adaptDesktopRuntimeToHandle(desktop);
  runtime.attachHandle(handle);
  return { runtime, interaction, layerIds: [...desktop.layerIds] };
}

/**
 * 从 fixture presentation 推算世界包围中心 + 半径。
 */
export function computeDesktopWorldBounds(presentation: WorldPresentation): {
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
