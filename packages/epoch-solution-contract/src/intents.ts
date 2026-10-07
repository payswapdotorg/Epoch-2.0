/**
 * epoch-solution-contract 类型化交互意图。
 *
 * 依据 spec/architecture/contracts/interaction.md：每个空间用户手势必须
 * 先成为类型化 Epoch 交互意图，才能影响语义状态；意图从渲染器适配器
 * 归一化而来，经语义权威解析实体，再驱动全部下游投影。
 *
 * 冻结为闭合联合（六种初始意图；未来 manipulation/simulation/intervention/
 * approve-commit 需要契约变更加入）。渲染器中立：载荷只有字符串、数字、
 * 字符串数组与 Vec3——不得包含 Babylon/Three 类或句柄。
 *
 * 测量：引用语义实体 id 和/或世界坐标；渲染器只提供创建语义测量所需的
 * 观测（from/to 观测点）。标注：附着于语义实体或稳定世界坐标。
 */
import type { Vec3 } from "@zcode/epoch-world-presentation";
import { isVec3 } from "@zcode/epoch-world-presentation";

/** 意图种类判别值（闭合集合）。 */
export const SOLUTION_INTERACTION_INTENT_KINDS = [
  "solution.navigate",
  "solution.select",
  "solution.focus",
  "solution.setLayerVisibility",
  "solution.measure",
  "solution.annotate",
] as const;
export type SolutionInteractionIntentKind = (typeof SOLUTION_INTERACTION_INTENT_KINDS)[number];

/** 选择模式。 */
export const SOLUTION_SELECTION_MODES = ["replace", "add", "toggle"] as const;
export type SolutionSelectionMode = (typeof SOLUTION_SELECTION_MODES)[number];

/** 导航意图：框选语义实体或世界点（摄像机语义属运行时投影，不在此冻结）。 */
export interface SolutionNavigateIntent {
  readonly kind: "solution.navigate";
  readonly entityIds?: readonly string[];
  readonly worldPoint?: Vec3;
}

/** 选择意图：以规范实体 id 集合更新选择。 */
export interface SolutionSelectIntent {
  readonly kind: "solution.select";
  readonly entityIds: readonly string[];
  readonly mode?: SolutionSelectionMode;
}

/** 聚焦意图：entityId 缺省表示清除聚焦。 */
export interface SolutionFocusIntent {
  readonly kind: "solution.focus";
  readonly entityId?: string;
}

/** 图层可见性意图（语义图层）。 */
export interface SolutionSetLayerVisibilityIntent {
  readonly kind: "solution.setLayerVisibility";
  readonly layerId: string;
  readonly visible: boolean;
}

/** 测量观测点：语义实体和/或世界坐标。 */
export interface SolutionMeasurementPoint {
  readonly entityId?: string;
  readonly point?: Vec3;
}

/** 测量意图：两点观测（渲染器只提供观测，语义测量由测量权威创建）。 */
export interface SolutionMeasureIntent {
  readonly kind: "solution.measure";
  readonly from: SolutionMeasurementPoint;
  readonly to: SolutionMeasurementPoint;
}

/** 标注意图：附着语义实体或稳定世界坐标的文本标注。 */
export interface SolutionAnnotateIntent {
  readonly kind: "solution.annotate";
  readonly text: string;
  readonly entityId?: string;
  readonly point?: Vec3;
  readonly annotationId?: string;
}

/** 类型化交互意图（闭合联合）。 */
export type SolutionInteractionIntent =
  | SolutionNavigateIntent
  | SolutionSelectIntent
  | SolutionFocusIntent
  | SolutionSetLayerVisibilityIntent
  | SolutionMeasureIntent
  | SolutionAnnotateIntent;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  // “非空数组”约束同时作用于数组本身与每个成员（选择零个实体不是合法选择）。
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function isOptionalNonEmptyStringArray(value: unknown): boolean {
  return value === undefined || isNonEmptyStringArray(value);
}

function isMeasurementPoint(value: unknown): value is SolutionMeasurementPoint {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") return false;
  if (candidate.point !== undefined && !isVec3(candidate.point)) return false;
  // 观测点必须锚定语义实体和/或世界坐标（interaction.md「and/or」）。
  return candidate.entityId !== undefined || candidate.point !== undefined;
}

function isSelectionMode(value: unknown): value is SolutionSelectionMode {
  return (
    value === undefined ||
    (typeof value === "string" && SOLUTION_SELECTION_MODES.includes(value as SolutionSelectionMode))
  );
}

/** 意图守卫：闭合联合——未知 kind 一律拒绝。 */
export function isSolutionInteractionIntent(value: unknown): value is SolutionInteractionIntent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case "solution.navigate":
      return (
        isOptionalNonEmptyStringArray(candidate.entityIds) &&
        (candidate.worldPoint === undefined || isVec3(candidate.worldPoint))
      );
    case "solution.select":
      return isNonEmptyStringArray(candidate.entityIds) && isSelectionMode(candidate.mode);
    case "solution.focus":
      return candidate.entityId === undefined || typeof candidate.entityId === "string";
    case "solution.setLayerVisibility":
      return isNonEmptyString(candidate.layerId) && typeof candidate.visible === "boolean";
    case "solution.measure":
      return isMeasurementPoint(candidate.from) && isMeasurementPoint(candidate.to);
    case "solution.annotate":
      if (!isNonEmptyString(candidate.text)) return false;
      if (candidate.entityId !== undefined && typeof candidate.entityId !== "string") {
        return false;
      }
      if (candidate.point !== undefined && !isVec3(candidate.point)) return false;
      if (candidate.annotationId !== undefined && typeof candidate.annotationId !== "string") {
        return false;
      }
      return true;
    default:
      return false;
  }
}
