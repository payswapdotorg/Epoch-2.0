/**
 * epoch-world-interaction 工厂：组装测量 + 标注注册表 + plan/section path 计算器。
 *
 * 宿主（packages/web、packages/desktop）注入 entityPoints 映射（来自 fixture
 * geometry），即可创建一个完整的交互层。交互层是无状态计算 + 投影态注册表，
 * 不持有渲染器会话——宿主负责编排（pointer → renderer.hitTest →
 * interaction.createMeasurement → runtime.addMeasurementRef → rendererSession）。
 */
import { createMeasurementRegistry } from "./measurement.ts";
import { createAnnotationRegistry } from "./annotation.ts";
import { computePlanViewPath, computeSectionCutPath } from "./navigation-path.ts";
import type { Vec3 } from "@zcode/epoch-world-presentation";
import type { WorldInteractionLayer } from "./contract.ts";

export interface CreateWorldInteractionOptions {
  /** 实体 -> 世界坐标映射（用于解析只锚定 entityId 的测量点）。 */
  readonly entityPoints?: ReadonlyMap<string, Vec3>;
  readonly now?: () => number;
}

export function createWorldInteraction(
  options?: CreateWorldInteractionOptions,
): WorldInteractionLayer {
  const measurements = createMeasurementRegistry({
    entityPoints: options?.entityPoints,
    now: options?.now,
  });
  const annotations = createAnnotationRegistry({ now: options?.now });
  return {
    measurements,
    annotations,
    computePlanViewPath: (worldBounds) => computePlanViewPath(worldBounds),
    computeSectionCutPath: (worldBounds, opts) => computeSectionCutPath(worldBounds, opts),
  };
}
