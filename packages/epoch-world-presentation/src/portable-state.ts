/**
 * epoch-world-presentation 可移植渲染器切换状态。
 *
 * 依据 spec/architecture/contracts/world-presentation.md「Portable state」与
 * ARCHITECTURE-LOCK #12：世界身份/摘要、聚焦实体、图层状态、标注引用、
 * 测量引用、时间线位置与 agent 引用在渲染器切换中存活；原始 GPU 状态
 * 永不携带。时间线坐标的语义单位由 Epoch timeline 权威（W018）定义，
 * 这里只保留可移植槽位。
 */
import type { WorldProjectionMode } from "./representation.ts";
import { isWorldProjectionMode } from "./representation.ts";

/** 渲器切换时可携带/恢复的语义投影状态。 */
export interface PortableRendererState {
  readonly worldId: string;
  readonly digest: string;
  readonly focusedEntityId?: string;
  /** 处于隐藏态的语义图层（缺省=全部可见）。 */
  readonly hiddenLayerIds?: readonly string[];
  readonly annotationRefs?: readonly string[];
  readonly measurementRefs?: readonly string[];
  /** 时间线位置（timeline 权威定义的语义坐标）。 */
  readonly timelinePosition?: number;
  readonly agentRefs?: readonly string[];
  /** 当前投影模式（随切换恢复）。 */
  readonly projectionMode?: WorldProjectionMode;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/** 可移植状态守卫。 */
export function isPortableRendererState(value: unknown): value is PortableRendererState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.worldId !== "string" || candidate.worldId.length === 0) return false;
  if (typeof candidate.digest !== "string" || candidate.digest.length === 0) return false;
  if (candidate.focusedEntityId !== undefined && typeof candidate.focusedEntityId !== "string") {
    return false;
  }
  if (candidate.hiddenLayerIds !== undefined && !isNonEmptyStringArray(candidate.hiddenLayerIds)) {
    return false;
  }
  if (candidate.annotationRefs !== undefined && !isNonEmptyStringArray(candidate.annotationRefs)) {
    return false;
  }
  if (
    candidate.measurementRefs !== undefined &&
    !isNonEmptyStringArray(candidate.measurementRefs)
  ) {
    return false;
  }
  if (
    candidate.timelinePosition !== undefined &&
    (typeof candidate.timelinePosition !== "number" || !Number.isFinite(candidate.timelinePosition))
  ) {
    return false;
  }
  if (candidate.agentRefs !== undefined && !isNonEmptyStringArray(candidate.agentRefs)) {
    return false;
  }
  if (candidate.projectionMode !== undefined && !isWorldProjectionMode(candidate.projectionMode)) {
    return false;
  }
  return true;
}
