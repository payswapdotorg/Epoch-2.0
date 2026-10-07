/**
 * epoch-world-presentation 交互绑定与表现节点。
 *
 * 依据 spec/architecture/contracts/world-presentation.md「Conceptual shape」。
 * 交互绑定定义该节点的可交互性与所属语义图层；选择映射沿
 * presentationId -> node -> entityId 解析（spec「Conceptual shape」的
 * entityId 字段），UI 不得从 mesh 名推断工程身份。
 */
import type { Transform } from "./math.ts";
import { isTransform } from "./math.ts";
import type { RepresentationRef } from "./representation.ts";
import { isRepresentationRef } from "./representation.ts";

/**
 * 交互绑定：节点级交互语义。
 *
 * - selectable/focusable：该节点是否参与选择/聚焦命中。
 * - layerIds：节点所属语义可见图层（solution.setLayerVisibility 的作用域）。
 */
export interface InteractionBinding {
  readonly selectable: boolean;
  readonly focusable: boolean;
  readonly layerIds: readonly string[];
}

/** 交互绑定守卫。 */
export function isInteractionBinding(value: unknown): value is InteractionBinding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.selectable !== "boolean") return false;
  if (typeof candidate.focusable !== "boolean") return false;
  if (!Array.isArray(candidate.layerIds)) return false;
  if (!candidate.layerIds.every((layerId) => typeof layerId === "string" && layerId.length > 0)) {
    return false;
  }
  return true;
}

/** 节点可见性。 */
export const PRESENTATION_NODE_VISIBILITIES = ["visible", "hidden"] as const;
export type PresentationNodeVisibility = (typeof PRESENTATION_NODE_VISIBILITIES)[number];

/** 节点可见性守卫。 */
export function isPresentationNodeVisibility(value: unknown): value is PresentationNodeVisibility {
  return (
    typeof value === "string" &&
    PRESENTATION_NODE_VISIBILITIES.includes(value as PresentationNodeVisibility)
  );
}

/**
 * 世界表现节点：渲染器中立的表现图元。
 * presentationId 是表现身份；entityId 是可选的语义身份映射
 * （「Selection is semantic」的解析链路见 InteractionBinding 模块注释）。
 */
export interface WorldPresentationNode {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly transform: Transform;
  readonly representations: readonly RepresentationRef[];
  readonly visibility: PresentationNodeVisibility;
  readonly interaction: InteractionBinding;
}

/** 表现节点守卫。 */
export function isWorldPresentationNode(value: unknown): value is WorldPresentationNode {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.presentationId !== "string" || candidate.presentationId.length === 0) {
    return false;
  }
  if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") return false;
  if (
    candidate.parentPresentationId !== undefined &&
    (typeof candidate.parentPresentationId !== "string" ||
      candidate.parentPresentationId.length === 0)
  ) {
    return false;
  }
  if (!isTransform(candidate.transform)) return false;
  if (!Array.isArray(candidate.representations)) return false;
  if (!candidate.representations.every((item) => isRepresentationRef(item))) return false;
  if (!isPresentationNodeVisibility(candidate.visibility)) return false;
  if (!isInteractionBinding(candidate.interaction)) return false;
  return true;
}
